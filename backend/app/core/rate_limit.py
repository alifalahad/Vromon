"""
Vromon Backend — rate limiting (slowapi), per client IP.

Behind a proxy (Render), run uvicorn with `--proxy-headers --forwarded-allow-ips`
so the client IP comes from X-Forwarded-For instead of the proxy's address.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

USERNAME_CHECK_LIMIT = "30/minute"
# Grounded answers and explanations call a paid LLM
LLM_LIMIT = "20/minute"
# Finding people (username search, friend-code lookups) and sending requests
FRIEND_LOOKUP_LIMIT = "30/minute"
FRIEND_REQUEST_LIMIT = "20/minute"
# Photo uploads (decoding and re-encoding is CPU work); several are picked at once
PHOTO_UPLOAD_LIMIT = "60/minute"
