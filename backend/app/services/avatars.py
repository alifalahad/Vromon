"""
Profile photos: the picture is cropped to a square, resized to 512 px and re-encoded as JPEG
(which drops its metadata, location included), then uploaded to ImgBB with the server's key.
The app never holds the key. ImgBB serves the image to anyone with its URL; profiles are public
(decision D3), so that is the same audience.
"""

from __future__ import annotations

import base64
import io

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from app.core.config import settings

IMGBB_UPLOAD = "https://api.imgbb.com/1/upload"
SIZE = 512
MAX_BYTES = 8 * 1024 * 1024


class AvatarRejected(ValueError):
    """The upload isn't a usable picture."""


class AvatarUnavailable(RuntimeError):
    """Photos are off (no key) or ImgBB didn't take the picture."""


def square_jpeg(data: bytes) -> bytes:
    if len(data) > MAX_BYTES:
        raise AvatarRejected("Profile photos can be up to 8 MB")
    try:
        with Image.open(io.BytesIO(data)) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
    except (UnidentifiedImageError, OSError):
        raise AvatarRejected("That isn't a picture we can read (JPEG, PNG or WebP)")
    im = ImageOps.fit(im, (SIZE, SIZE), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=88, optimize=True)
    return out.getvalue()


def upload(jpeg: bytes, name: str, client: httpx.Client | None = None) -> str:
    """The picture's URL on ImgBB."""
    if not settings.imgbb_api_key:
        raise AvatarUnavailable("Profile photos aren't set up on this server (IMGBB_API_KEY)")
    own = client is None
    client = client or httpx.Client(timeout=30)
    try:
        r = client.post(IMGBB_UPLOAD, params={"key": settings.imgbb_api_key},
                        data={"image": base64.b64encode(jpeg).decode(), "name": name})
    except httpx.HTTPError as exc:
        raise AvatarUnavailable(f"ImgBB unreachable: {exc}") from exc
    finally:
        if own:
            client.close()
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code != 200 or not body.get("success"):
        raise AvatarUnavailable(f"ImgBB answered {r.status_code}: {(body.get('error') or {}).get('message', '')}")
    data = body["data"]
    return data.get("display_url") or data["url"]
