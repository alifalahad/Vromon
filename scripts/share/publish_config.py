"""
Publish the backend's current public address for the shared (preview) app.

The app reads https://<project>.supabase.co/storage/v1/object/public/share/config.json
at start, so a new tunnel address reaches friends' phones without a new APK.

    backend/venv/bin/python scripts/share/publish_config.py https://abc-def.trycloudflare.com
    backend/venv/bin/python scripts/share/publish_config.py --url     # print the config file's public URL

The Supabase service role key is read from backend/.env and only ever sent to Supabase.
"""
import json
import re
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

BUCKET = "share"
OBJECT = "config.json"
ENV = Path(__file__).resolve().parents[2] / "backend" / ".env"

try:  # python.org builds on macOS ship without the system certificates
    import certifi
    TLS = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    TLS = ssl.create_default_context()


def env() -> dict:
    values = {}
    for line in ENV.read_text().splitlines():
        m = re.match(r"\s*([A-Z_]+)\s*=\s*(.*)\s*$", line)
        if m and not line.lstrip().startswith("#"):
            values[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return values


def call(method: str, url: str, key: str, body: bytes | None = None, headers: dict | None = None) -> int:
    req = urllib.request.Request(url, data=body, method=method, headers={
        "Authorization": f"Bearer {key}", "apikey": key, **(headers or {}),
    })
    try:
        with urllib.request.urlopen(req, timeout=20, context=TLS) as r:
            return r.status
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:200]
        if method == "POST" and url.endswith("/bucket") and ("already exists" in detail or e.code == 409):
            return 200
        raise SystemExit(f"Supabase said {e.code}: {detail}")


def main() -> None:
    values = env()
    base, key = values.get("SUPABASE_URL", "").rstrip("/"), values.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base or not key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env")
    public = f"{base}/storage/v1/object/public/{BUCKET}/{OBJECT}"
    if sys.argv[1:] == ["--url"]:
        print(public)
        return
    if len(sys.argv) != 2 or not re.fullmatch(r"https://[a-z0-9.-]+", sys.argv[1]):
        raise SystemExit("usage: publish_config.py https://<address>")

    # A public bucket that only holds this small file
    call("POST", f"{base}/storage/v1/bucket", key, json.dumps({
        "id": BUCKET, "name": BUCKET, "public": True,
        "file_size_limit": 1024, "allowed_mime_types": ["application/json"],
    }).encode(), {"Content-Type": "application/json"})
    call("POST", f"{base}/storage/v1/object/{BUCKET}/{OBJECT}", key,
         json.dumps({"apiUrl": sys.argv[1]}).encode(),
         {"Content-Type": "application/json", "x-upsert": "true", "cache-control": "max-age=0"})
    print(public)


if __name__ == "__main__":
    main()
