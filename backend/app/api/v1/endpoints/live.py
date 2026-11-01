"""
Vromon API v1 — live updates for chat (docs/friends-chat-plan.md, step 2).

WS /ws

1. The app connects and sends {"type": "auth", "token": "<Supabase access token>"}
   within AUTH_TIMEOUT seconds; the token never goes in the URL (URLs end up in logs).
   A bad or missing token closes the socket with 4401; when the sign-in service
   can't be reached it closes with 1013 (try again), so the app doesn't sign out.
2. The server answers {"type": "ready", "user_id": …}. The app then fetches what it
   missed: each chat's newest page again, merged by message id
   (GET /conversations/{id}/messages?after=<last id> also pages forward).
3. Server → app: message.created, message.updated, conversation.read,
   conversation.updated, typing, and {"type": "ping"} every PING_EVERY seconds.
   The socket closes with 4401 when the token expires; the app reconnects with a fresh one.
4. App → server: {"type": "typing", "conversation_id": …} (at most one every 3 s
   counts) and {"type": "ping"}, answered with {"type": "pong"}.

Limits (step 10): a message from the app is at most MAX_INCOMING characters (1009), at
most INCOMING_LIMIT of them every INCOMING_WINDOW seconds (1008), and a person has at most
live.MAX_SOCKETS_PER_USER sockets open (a new one closes their oldest with 1013). In
production uvicorn also refuses frames over --ws-max-size (Dockerfile) before reading them.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from contextlib import contextmanager, suppress
from typing import Callable, Iterator, Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket
from starlette.concurrency import run_in_threadpool
from starlette.websockets import WebSocketDisconnect
from sqlalchemy.orm import Session

from app.core.auth import DEV_BYPASS_SUBJECT, get_or_create_user, verify_access_token
from app.core.config import settings
from app.db import get_db
from app.models.models import User
from app.services import live

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)

AUTH_TIMEOUT = 5.0
PING_EVERY = 25.0
# Messages from the app are tiny (typing, ping)
MAX_INCOMING = 4096
# The app sends a typing hint at most every 3 s per chat; ten times that is a client gone wrong
INCOMING_LIMIT = 30
INCOMING_WINDOW = 10.0


class SignInUnavailable(Exception):
    """The sign-in service couldn't check the token; not the token's fault."""


# (session, token) → (user, when the token expires as a Unix time) or None when the token isn't valid
Authenticator = Callable[[Session, Optional[str]], Optional[tuple[User, Optional[float]]]]


def authenticate(db: Session, token: Optional[str]) -> Optional[tuple[User, Optional[float]]]:
    """The user for an access token, as get_current_user does it."""
    if not token:
        if settings.dev_auth_bypass and settings.app_env == "development":
            return get_or_create_user(db, DEV_BYPASS_SUBJECT, None), None
        return None
    try:
        claims = verify_access_token(token)
    except HTTPException as exc:
        if exc.status_code == 401:
            return None
        raise SignInUnavailable() from exc
    return get_or_create_user(db, str(claims["sub"]), claims.get("email")), float(claims["exp"])


def ws_authenticator() -> Authenticator:
    """A dependency, so tests can replace the token check (as act_as replaces get_current_user)."""
    return authenticate


@contextmanager
def _session(websocket: WebSocket) -> Iterator[Session]:
    """
    A short database session from the same get_db as the HTTP routes (tests override it).
    A socket never holds one while it waits: a few dozen open apps would use up the pool.
    """
    provider = websocket.app.dependency_overrides.get(get_db, get_db)
    gen = provider()
    db = next(gen)
    try:
        yield db
    finally:
        gen.close()


def _token(text: str) -> tuple[bool, Optional[str]]:
    """(is it an auth message, its token)."""
    try:
        data = json.loads(text)
    except ValueError:
        return False, None
    if not isinstance(data, dict) or data.get("type") != "auth":
        return False, None
    token = data.get("token")
    return True, token if isinstance(token, str) else None


async def _keepalive(conn: live.Connection, expires_at: Optional[float]) -> None:
    """Ping every PING_EVERY seconds; close with 4401 the moment the token expires."""
    next_ping = time.monotonic() + PING_EVERY
    while True:
        wait = next_ping - time.monotonic()
        if expires_at is not None:
            wait = min(wait, expires_at - time.time())
        await asyncio.sleep(max(wait, 0))
        if expires_at is not None and time.time() >= expires_at:
            conn.close(live.UNAUTHORIZED)
            return
        if time.monotonic() >= next_ping:
            conn.offer({"type": "ping"})
            next_ping = time.monotonic() + PING_EVERY


async def _read(websocket: WebSocket, conn: live.Connection) -> None:
    """Handle what the app sends until it disconnects (or sends too much)."""
    window, count = time.monotonic(), 0
    while True:
        text = await websocket.receive_text()
        if len(text) > MAX_INCOMING:
            conn.close(live.TOO_BIG)
            return
        if time.monotonic() - window >= INCOMING_WINDOW:
            window, count = time.monotonic(), 0
        count += 1
        if count > INCOMING_LIMIT:
            conn.close(live.TOO_CHATTY)
            return
        try:
            data = json.loads(text)
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        kind = data.get("type")
        if kind == "ping":
            conn.offer({"type": "pong"})
        elif kind == "typing":
            conversation_id = data.get("conversation_id")
            if type(conversation_id) is int and live.hub.allow_typing(conn.user_id, conversation_id):
                try:
                    await run_in_threadpool(_typing, websocket, conn.user_id, conversation_id)
                except Exception:  # a lost typing hint isn't worth the connection
                    logger.exception("Typing event for conversation %s failed", conversation_id)


def _typing(websocket: WebSocket, user_id: uuid.UUID, conversation_id: int) -> None:
    with _session(websocket) as db:
        user = db.get(User, user_id)
        if user is not None:
            live.typing(db, conversation_id, user)


def _sign_in(websocket: WebSocket, auth: Authenticator, token: Optional[str]) -> Optional[tuple[uuid.UUID, Optional[float]]]:
    with _session(websocket) as db:
        result = auth(db, token)
        return (result[0].id, result[1]) if result is not None else None


@router.websocket("/ws")
async def live_updates(websocket: WebSocket, auth: Authenticator = Depends(ws_authenticator)):
    await websocket.accept()
    try:
        first = await asyncio.wait_for(websocket.receive_text(), AUTH_TIMEOUT)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await _close(websocket, live.UNAUTHORIZED)
        return
    is_auth, token = _token(first)
    if not is_auth:
        await _close(websocket, live.UNAUTHORIZED)
        return
    try:
        signed_in = await run_in_threadpool(_sign_in, websocket, auth, token)
    except SignInUnavailable:
        await _close(websocket, live.TRY_AGAIN)
        return
    if signed_in is None:
        await _close(websocket, live.UNAUTHORIZED)
        return
    user_id, expires_at = signed_in

    conn = live.Connection(websocket, user_id, asyncio.get_running_loop())
    live.hub.add(conn)
    conn.offer({"type": "ready", "user_id": str(user_id)})
    tasks = [
        asyncio.create_task(conn.write()),
        asyncio.create_task(_read(websocket, conn)),
        asyncio.create_task(_keepalive(conn, expires_at)),
    ]
    try:
        # Ends when the writer has sent a close, or the app went away
        await asyncio.wait(tasks[:2], return_when=asyncio.FIRST_COMPLETED)
    finally:
        live.hub.remove(conn)
        for task in tasks:
            task.cancel()
        for task in tasks:
            with suppress(BaseException):  # a disconnect or the cancel itself
                await task
        if conn.close_code is not None and not conn.close_sent:
            await _close(websocket, conn.close_code)


async def _close(websocket: WebSocket, code: int) -> None:
    try:
        await websocket.close(code=code)
    except (RuntimeError, WebSocketDisconnect):
        pass  # already closed
