"""
Vromon Backend — rate limiting (slowapi), per client IP (chat: per user, see `user_or_ip`).

Behind a proxy (Render), run uvicorn with `--proxy-headers --forwarded-allow-ips`
so the client IP comes from X-Forwarded-For instead of the proxy's address.
"""

from __future__ import annotations

from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.requests import Request

limiter = Limiter(key_func=get_remote_address)


def user_or_ip(request: Request) -> str:
    """
    Per signed-in user where an endpoint puts the user on the request (`rate_limit_user`),
    so people behind one address (shared Wi-Fi, a mobile carrier's NAT) don't share a limit.
    slowapi checks after FastAPI has resolved the endpoint's dependencies, so it's set by then.
    """
    return getattr(request.state, "rate_limit_user", None) or get_remote_address(request)

USERNAME_CHECK_LIMIT = "30/minute"
# Grounded answers and explanations call a paid LLM
LLM_LIMIT = "20/minute"
# Finding people (username search, friend-code lookups) and sending requests
FRIEND_LOOKUP_LIMIT = "30/minute"
FRIEND_REQUEST_LIMIT = "20/minute"
# Photo uploads (decoding and re-encoding is CPU work); several are picked at once
PHOTO_UPLOAD_LIMIT = "60/minute"
# Sending chat messages, per user (user_or_ip)
CHAT_SEND_LIMIT = "30/minute"
# Trip room invites (step 7): each one posts into a friend's chat
ROOM_INVITE_LIMIT = "20/minute"
# Live location points (step 8): the app sends one a minute; a little room for retries
LIVE_POINT_LIMIT = "6/minute"
# Answering polls and trip ideas, per user: each answer goes live to everyone in the chat
CHAT_VOTE_LIMIT = "60/minute"
# Reporting messages, per user
CHAT_REPORT_LIMIT = "10/minute"
