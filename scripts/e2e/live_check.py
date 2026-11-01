#!/usr/bin/env python3
"""
Live chat check: account A listens on the WebSocket while account B sends A a message.
Prints how long the message took to arrive on A's socket.

    backend/venv/bin/python scripts/e2e/live_check.py                                  # the dev backend (8001)
    backend/venv/bin/python scripts/e2e/live_check.py https://<name>.trycloudflare.com  # through the share's tunnel

The accounts come from .env.e2e.local (see scripts/e2e/session.py). The message
goes into the test accounts' own chat, so run it against a backend that uses a database
you don't mind getting one more test message.
"""

import argparse
import asyncio
import json
import ssl
import sys
import time
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from session import read_env, sign_in, tls  # noqa: E402

try:
    import websockets
except ImportError:
    sys.exit("Run it with the backend's Python (backend/venv/bin/python): it has the websockets package.")


def call(base: str, token: str, method: str, path: str, body: dict | None = None):
    request = urllib.request.Request(
        f"{base}/api/v1{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    context = tls() if base.startswith("https") else None
    with urllib.request.urlopen(request, context=context, timeout=20) as response:
        raw = response.read()
        return response.status, json.loads(raw) if raw else None  # 204: no body


async def check(base: str) -> None:
    a, _ = sign_in("A")
    b, accounts = sign_in("B")
    b_username = accounts["E2E_B_USERNAME"]
    _, friends = call(base, a["access_token"], "GET", "/friends")
    b_id = next((f["id"] for f in friends if f["username"] == b_username), None)
    if b_id is None:
        sys.exit(f"{accounts['E2E_A_USERNAME']} and {b_username} aren't friends on this backend")
    _, conversation = call(base, a["access_token"], "POST", "/conversations/direct", {"user_id": b_id})

    ws_url = base.replace("https://", "wss://").replace("http://", "ws://") + "/api/v1/ws"
    context = tls() if ws_url.startswith("wss") else None
    async with websockets.connect(ws_url, ssl=context) as ws:
        await ws.send(json.dumps({"type": "auth", "token": a["access_token"]}))
        ready = json.loads(await asyncio.wait_for(ws.recv(), 15))
        if ready.get("type") != "ready":
            sys.exit(f"The socket didn't sign in: {ready}")
        print(f"A's socket is live ({ws_url})")
        text = f"Live check {time.strftime('%H:%M:%S')} #{uuid.uuid4().hex[:4]}"
        started = time.monotonic()
        sent = asyncio.create_task(asyncio.to_thread(
            call, base, b["access_token"], "POST", f"/conversations/{conversation['id']}/messages",
            {"client_id": str(uuid.uuid4()), "body": text},
        ))
        while True:
            event = json.loads(await asyncio.wait_for(ws.recv(), 15))
            if event.get("type") == "message.created" and event["message"]["body"] == text:
                break
        arrived = time.monotonic()
        status, _ = await sent
        print(f"B sent {text!r} (HTTP {status}); A got it {1000 * (arrived - started):.0f} ms after B started sending")


def main() -> None:
    parser = argparse.ArgumentParser(description="Check live chat between the two test accounts.")
    parser.add_argument("base", nargs="?", default=read_env(Path(__file__).resolve().parents[2] / ".env.e2e.local").get("API_URL", "http://127.0.0.1:8001"))
    asyncio.run(check(parser.parse_args().base.rstrip("/")))


if __name__ == "__main__":
    main()
