"""
One HTTP client for every connector: a clear User-Agent, polite pacing per host,
robots.txt respected, and TLS verified by the operating system's certificate store.

Several .gov.bd sites send an incomplete certificate chain. Python's bundled
certificates can't complete it, but the OS verifier (via `truststore`) fetches the
missing intermediate, so verification stays on. It is never turned off.
"""

from __future__ import annotations

import os
import ssl
import threading
import time
import urllib.robotparser
from urllib.parse import urlsplit

import httpx
import truststore
from dotenv import load_dotenv

from vromon_data.paths import PLATFORM_DIR

load_dotenv(PLATFORM_DIR / ".env")

# Wikimedia's User-Agent policy requires contact details; they come from the git-ignored
# data-platform/.env (VROMON_BOT_CONTACT), never from code.
BOT_CONTACT = os.environ.get("VROMON_BOT_CONTACT", "").strip()
USER_AGENT = (
    f"VromonDataBot/0.1 (Bangladesh travel data pipeline; {BOT_CONTACT}) httpx/{httpx.__version__}"
    if BOT_CONTACT else
    f"VromonDataBot/0.1 (Bangladesh travel data pipeline) httpx/{httpx.__version__}"
)
MIN_INTERVAL_S = 2.0  # at most one request every 2 s per host

_ssl_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
_last_request: dict[str, float] = {}
_robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}
_lock = threading.Lock()


class BlockedByRobots(Exception):
    pass


def client(timeout: float = 60.0) -> httpx.Client:
    return httpx.Client(
        verify=_ssl_context,
        timeout=timeout,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )


def _pace(host: str) -> None:
    with _lock:
        wait = _last_request.get(host, 0.0) + MIN_INTERVAL_S - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        _last_request[host] = time.monotonic()


def robots_allows(c: httpx.Client, url: str) -> bool:
    """True unless the site's robots.txt disallows the URL. A missing robots.txt allows everything."""
    parts = urlsplit(url)
    base = f"{parts.scheme}://{parts.netloc}"
    if base not in _robots:
        parser: urllib.robotparser.RobotFileParser | None = None
        try:
            r = c.get(base + "/robots.txt")
            if r.status_code == 200 and "text" in r.headers.get("content-type", "text"):
                parser = urllib.robotparser.RobotFileParser()
                parser.parse(r.text.splitlines())
        except httpx.HTTPError:
            parser = None
        _robots[base] = parser
    parser = _robots[base]
    return parser is None or parser.can_fetch(USER_AGENT, url)


def get(c: httpx.Client, url: str, *, check_robots: bool = True, **kwargs) -> httpx.Response:
    if check_robots and not robots_allows(c, url):
        raise BlockedByRobots(url)
    _pace(urlsplit(url).netloc)
    return c.get(url, **kwargs)
