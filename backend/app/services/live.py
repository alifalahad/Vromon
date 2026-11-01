"""
Vromon Backend — live chat events over WebSockets (docs/friends-chat-plan.md, step 2).

The hub keeps each signed-in app's socket in memory, by user. That is right for
one server process; with several, `Hub.publish` is the one place to change
(Postgres LISTEN/NOTIFY, technology decision 30).

Events go out only after the database commit, and only to members who can see
the conversation (`chat.seat`). Each connection has its own queue and writer
task, so events reach a socket in order and never from two tasks at once.
Endpoints run in worker threads, so publishing hands each event to the
connection's own event loop.
"""

from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from contextlib import suppress
from typing import Iterable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.models import Block, Conversation, ConversationMember, Message, User
from app.services import cards, chat, ontrip

logger = logging.getLogger(__name__)

# Close codes the app understands
UNAUTHORIZED = 4401  # sign in again (bad or expired token)
TRY_AGAIN = 1013  # the server can't serve this socket now (overloaded queue, sign-in service down)
TOO_BIG = 1009
TOO_CHATTY = 1008  # the app sent far more than it ever needs to

# Open sockets per person (a phone or two, and a reconnect that overlaps): a new one past
# this closes their oldest, which is most likely a dead connection nobody noticed yet
MAX_SOCKETS_PER_USER = 5

# A socket that can't keep up is closed; the app reconnects and fetches what it missed
QUEUE_LIMIT = 256
# At most one typing event per person per conversation in this time
TYPING_EVERY = 3.0

_CLOSE = object()


class Connection:
    """One open socket. `offer` and `close` run on the connection's own event loop."""

    def __init__(self, websocket, user_id: uuid.UUID, loop: asyncio.AbstractEventLoop):
        self.websocket = websocket
        self.user_id = user_id
        self.loop = loop
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_LIMIT)
        self.opened = time.monotonic()
        self.close_code: Optional[int] = None
        self.close_sent = False

    def offer(self, event: dict) -> None:
        if self.close_code is not None:
            return
        try:
            self._queue.put_nowait(event)
        except asyncio.QueueFull:
            logger.info("Live socket for %s fell behind; closing it", self.user_id)
            self.close(TRY_AGAIN)

    def close(self, code: int) -> None:
        if self.close_code is not None:
            return
        self.close_code = code
        while True:  # make room for the close marker: nothing else matters now
            try:
                self._queue.put_nowait(_CLOSE)
                return
            except asyncio.QueueFull:
                self._queue.get_nowait()

    async def write(self) -> None:
        """Send queued events in order until closed."""
        while True:
            event = await self._queue.get()
            if event is _CLOSE:
                self.close_sent = True
                with suppress(Exception):
                    await self.websocket.close(code=self.close_code)
                return
            await self.websocket.send_json(event)


class Hub:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._by_user: dict[uuid.UUID, set[Connection]] = {}
        self._typing: dict[tuple[uuid.UUID, int], float] = {}

    def add(self, conn: Connection) -> None:
        with self._lock:
            conns = self._by_user.setdefault(conn.user_id, set())
            conns.add(conn)
            oldest = sorted(conns, key=lambda c: c.opened)[: max(len(conns) - MAX_SOCKETS_PER_USER, 0)]
        for old in oldest:
            try:
                old.loop.call_soon_threadsafe(old.close, TRY_AGAIN)
            except RuntimeError:  # its event loop has stopped
                self.remove(old)

    def remove(self, conn: Connection) -> None:
        with self._lock:
            conns = self._by_user.get(conn.user_id)
            if conns is not None:
                conns.discard(conn)
                if not conns:
                    del self._by_user[conn.user_id]

    def connections(self, user_id: uuid.UUID) -> int:
        with self._lock:
            return len(self._by_user.get(user_id, ()))

    def _each(self, user_ids: Iterable[uuid.UUID], fn_name: str, arg) -> None:
        with self._lock:
            targets = [c for uid in set(user_ids) for c in self._by_user.get(uid, ())]
        for conn in targets:
            try:
                conn.loop.call_soon_threadsafe(getattr(conn, fn_name), arg)
            except RuntimeError:  # its event loop has stopped
                self.remove(conn)

    def publish(self, user_ids: Iterable[uuid.UUID], event: dict) -> None:
        """Send an event to every open socket of these users. Safe from any thread."""
        self._each(user_ids, "offer", event)

    def close_user(self, user_id: uuid.UUID, code: int) -> None:
        self._each([user_id], "close", code)

    def allow_typing(self, user_id: uuid.UUID, conversation_id: int) -> bool:
        """One typing event per person per conversation every TYPING_EVERY seconds."""
        now = time.monotonic()
        key = (user_id, conversation_id)
        with self._lock:
            if now - self._typing.get(key, -TYPING_EVERY) < TYPING_EVERY:
                return False
            self._typing[key] = now
            if len(self._typing) > 10_000:
                self._typing = {k: t for k, t in self._typing.items() if now - t < TYPING_EVERY}
            return True


hub = Hub()


# ---------------------------------------------------------------------------
# Events (call after the database commit)
# ---------------------------------------------------------------------------

def audience(db: Session, conversation_id: int) -> list[uuid.UUID]:
    """The members who can see the conversation now (not someone who blocked the other)."""
    member_ids = db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id)).all()
    out = []
    for uid in member_ids:
        user = db.get(User, uid)
        if user is not None and chat.seat(db, conversation_id, user) is not None:
            out.append(uid)
    return out


def _blocked(db: Session, viewer_id: uuid.UUID, sender_id: Optional[uuid.UUID]) -> bool:
    """The viewer blocked the sender: their messages are hidden from the viewer (trip rooms, rule 2)."""
    return sender_id is not None and db.get(Block, (viewer_id, sender_id)) is not None


def _message_event(db: Session, message: Message, kind: str) -> None:
    for uid in audience(db, message.conversation_id):
        if _blocked(db, uid, message.sender_id):
            continue
        # Rendered per person: only the sender's own apps get the client id back, and a
        # card is checked for each person (a trip they can't see arrives as unavailable)
        hub.publish([uid], {
            "type": kind,
            "conversation_id": message.conversation_id,
            "message": cards.render(db, [message], uid)[0].model_dump(mode="json"),
        })


def message_created(db: Session, message: Message) -> None:
    _message_event(db, message, "message.created")


def message_updated(db: Session, message: Message) -> None:
    """Unsent, or a poll's or trip idea's answers changed (and from step 5, reactions)."""
    _message_event(db, message, "message.updated")


def purge_expired_live(db: Session) -> None:
    """Live locations that ran out (step 8) are deleted, and their cards tell everyone they ended."""
    gone = ontrip.purge_expired(db)
    if not gone:
        return
    db.commit()
    for row in gone:
        card = db.get(Message, row.message_id)
        if card is not None:
            message_updated(db, card)


def conversation_read(db: Session, conversation_id: int, reader_id: uuid.UUID, last_read: int) -> None:
    """To the reader's other apps always; to the others only when both have read receipts on."""
    event = {"type": "conversation.read", "conversation_id": conversation_id, "user_id": str(reader_id), "last_read_message_id": last_read}
    hub.publish([reader_id], event)
    if not chat.receipts_on(db, reader_id):
        return
    others = [uid for uid in audience(db, conversation_id) if uid != reader_id and chat.receipts_on(db, uid)]
    hub.publish(others, event)


def conversation_updated(user_ids: Iterable[uuid.UUID], conversation_id: int) -> None:
    """Something about the chat changed for these people (state, membership, removed messages): fetch it again."""
    hub.publish(user_ids, {"type": "conversation.updated", "conversation_id": conversation_id})


def direct_chat_changed(db: Session, a: uuid.UUID, b: uuid.UUID) -> None:
    """After a friendship starts or ends, or a block: the pair's chat (if any) becomes writable or read-only."""
    conversation = db.scalar(select(Conversation).where(Conversation.direct_key == chat.direct_key(a, b)))
    if conversation is not None:
        conversation_updated([a, b], conversation.id)


def typing(db: Session, conversation_id: int, user: User) -> bool:
    """Tell the other members someone is typing. Nothing is stored. False when they can't write there."""
    s = chat.seat(db, conversation_id, user)
    if s is None or not s.can_send:
        return False
    others = [uid for uid in audience(db, conversation_id) if uid != user.id and not _blocked(db, uid, user.id)]
    hub.publish(others, {"type": "typing", "conversation_id": conversation_id, "user_id": str(user.id)})
    return True
