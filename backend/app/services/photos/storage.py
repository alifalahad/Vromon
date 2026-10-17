"""
Vromon Backend — where photo files live.

Photos sit in a private bucket. Clients never get bucket credentials: they get a
signed URL per file, issued only after the privacy check and valid for
`PHOTO_URL_TTL_SECONDS` (≤ 15 minutes).

- `SupabaseStore`: a private Supabase Storage bucket over its REST API, with the
  service role key (server-side only). Supabase checks the URL's expiry.
- `LocalStore`: files on disk, served by `GET /api/v1/photo-files/…` with an HMAC
  signature and expiry checked here. Development and tests only.

Object keys are `<photo uuid>/full.jpg` and `<photo uuid>/thumb.jpg`: random, and
not tied to the owner's user id.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
import secrets
import time
from functools import lru_cache
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlencode

import httpx
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger("vromon.photos.storage")

KEY_RE = re.compile(r"^[0-9a-f]{32}/(full|thumb)\.jpg$")


class StorageError(RuntimeError):
    """The storage backend failed; the request should fail with 502."""


class PhotoStore(Protocol):
    def put(self, key: str, data: bytes) -> None: ...
    def delete(self, keys: list[str]) -> None: ...
    def signed_urls(self, keys: list[str], ttl: int, base_url: str) -> dict[str, str]: ...


def photo_keys(photo_id_hex: str) -> tuple[str, str]:
    return f"{photo_id_hex}/full.jpg", f"{photo_id_hex}/thumb.jpg"


# ---------------------------------------------------------------------------
# Supabase Storage (private bucket)
# ---------------------------------------------------------------------------

class SupabaseStore:
    def __init__(self, url: str, service_key: str, bucket: str, *, client: httpx.Client | None = None):
        self.base = f"{url.rstrip('/')}/storage/v1"
        self.bucket = bucket
        self.client = client or httpx.Client(
            timeout=20,
            headers={"apikey": service_key, "Authorization": f"Bearer {service_key}"},
        )
        self._bucket_ready = False

    def _ensure_bucket(self) -> None:
        """Create the private bucket on first use (idempotent)."""
        if self._bucket_ready:
            return
        resp = self.client.get(f"{self.base}/bucket/{self.bucket}")
        if resp.status_code == 200:
            if resp.json().get("public"):
                raise StorageError(f"Bucket {self.bucket!r} is public; photos need a private bucket")
        else:
            resp = self.client.post(
                f"{self.base}/bucket",
                json={"id": self.bucket, "name": self.bucket, "public": False,
                      "file_size_limit": 8 * 1024 * 1024, "allowed_mime_types": ["image/jpeg"]},
            )
            if resp.status_code not in (200, 201) and "already exists" not in resp.text:
                raise StorageError(f"Creating bucket failed: {resp.status_code} {resp.text[:200]}")
            logger.info("Created private storage bucket %s", self.bucket)
        self._bucket_ready = True

    def put(self, key: str, data: bytes) -> None:
        self._ensure_bucket()
        resp = self.client.post(
            f"{self.base}/object/{self.bucket}/{quote(key)}",
            content=data,
            headers={"Content-Type": "image/jpeg", "Cache-Control": "max-age=31536000", "x-upsert": "false"},
        )
        if resp.status_code not in (200, 201):
            raise StorageError(f"Upload failed: {resp.status_code} {resp.text[:200]}")

    def delete(self, keys: list[str]) -> None:
        if not keys:
            return
        for start in range(0, len(keys), 500):  # stay well under request size limits
            resp = self.client.request("DELETE", f"{self.base}/object/{self.bucket}", json={"prefixes": keys[start:start + 500]})
            if resp.status_code not in (200, 404):
                raise StorageError(f"Delete failed: {resp.status_code} {resp.text[:200]}")

    def signed_urls(self, keys: list[str], ttl: int, base_url: str) -> dict[str, str]:
        if not keys:
            return {}
        resp = self.client.post(f"{self.base}/object/sign/{self.bucket}", json={"expiresIn": ttl, "paths": keys})
        if resp.status_code != 200:
            raise StorageError(f"Signing failed: {resp.status_code} {resp.text[:200]}")
        out = {}
        for item in resp.json():
            signed = item.get("signedURL")
            if signed and not item.get("error"):
                out[item["path"]] = signed if signed.startswith("http") else f"{self.base}{signed}"
        return out


# ---------------------------------------------------------------------------
# Local disk (development and tests)
# ---------------------------------------------------------------------------

class LocalStore:
    def __init__(self, root: str | Path, secret: bytes):
        self.root = Path(root).resolve()
        self.secret = secret

    def _path(self, key: str) -> Path:
        if not KEY_RE.fullmatch(key):
            raise ValueError(f"Bad photo key {key!r}")
        return self.root / key

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def delete(self, keys: list[str]) -> None:
        for key in keys:
            path = self._path(key)
            path.unlink(missing_ok=True)
            try:
                path.parent.rmdir()
            except OSError:
                pass  # not empty yet

    def _signature(self, key: str, expires: int) -> str:
        return hmac.new(self.secret, f"{key}:{expires}".encode(), hashlib.sha256).hexdigest()

    def signed_urls(self, keys: list[str], ttl: int, base_url: str) -> dict[str, str]:
        expires = int(time.time()) + ttl
        root = base_url.rstrip("/")
        return {k: f"{root}/api/v1/photo-files/{k}?{urlencode({'expires': expires, 'sig': self._signature(k, expires)})}" for k in keys}

    def open_signed(self, key: str, expires: int, sig: str) -> Path:
        """The file if the signature is valid and unexpired; otherwise 404."""
        if (
            not KEY_RE.fullmatch(key)
            or expires < time.time()
            or not hmac.compare_digest(self._signature(key, expires), sig)
        ):
            raise HTTPException(status_code=404, detail="Not found")
        path = self._path(key)
        if not path.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return path


# ---------------------------------------------------------------------------
# The configured store (a FastAPI dependency; tests override it)
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def _configured_store() -> PhotoStore | None:
    backend = settings.photo_backend
    if backend == "supabase":
        return SupabaseStore(settings.supabase_url, settings.supabase_service_role_key, settings.photo_bucket)
    if backend == "local":
        secret = settings.secret_key.encode() if settings.secret_key else secrets.token_bytes(32)
        return LocalStore(settings.photo_local_dir, secret)
    return None


def get_photo_store() -> PhotoStore:
    store = _configured_store()
    if store is None:
        raise HTTPException(status_code=503, detail="Photos are not configured on this server")
    return store


def optional_photo_store() -> PhotoStore | None:
    """For deletions that must work even where photos are switched off (and nobody has any)."""
    return _configured_store()
