"""
Vromon API v1 — chat between friends (docs/friends-chat-plan.md, steps 1 and 4).

GET /conversations · POST /conversations/direct · GET /conversations/{id} ·
GET/POST /conversations/{id}/messages · DELETE /conversations/{id}/messages/{message_id} ·
PUT /conversations/{id}/messages/{message_id}/vote · PUT/DELETE …/reaction ·
POST /conversations/{id}/read · PATCH /conversations/{id}/me · POST /messages/{id}/report ·
POST /me/chats/clear · GET /admin/reports

Only members see a conversation; anyone else, and a member who blocked the other
person, gets 404. Without a friendship a direct chat is read-only: sending and
voting answer 403. Messages are text or cards (services/cards.py), and every card
is checked again for each person who sees it. Every change is also sent to the
members' open apps after it's saved (WS /ws, live.py).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.friends import _public
from app.core.auth import get_current_user
from app.api.v1.endpoints.rag import require_admin
from app.core.rate_limit import CHAT_REPORT_LIMIT, CHAT_SEND_LIMIT, CHAT_VOTE_LIMIT, limiter, user_or_ip
from app.db import get_db
from app.models.models import ConversationMember, Message, MessageReport, Trip, User, UserSettings
from app.schemas.chat import (
    ConversationOut, DirectIn, MemberStateIn, MessageIn, MessageOut, MessagePageOut, ReactionIn, ReadIn, ReportIn, ReportOut,
    RoomTripOut, VoteIn,
)
from app.services import cards, chat, chat_push, live, rooms
from app.services import friends as social

router = APIRouter(tags=["chat"])

NOT_FOUND = HTTPException(status_code=404, detail="Not found")
PAGE_SIZE = 50


def _sender(request: Request, user: User = Depends(get_current_user)) -> User:
    """The signed-in user, also put on the request so the send limit counts per person."""
    request.state.rate_limit_user = f"user:{user.id}"
    return user


def _seat(db: Session, conversation_id: int, viewer: User) -> chat.Seat:
    s = chat.seat(db, conversation_id, viewer)
    if s is None:
        raise NOT_FOUND
    return s


def _conversations_out(
    db: Session, viewer: User, seats: list[chat.Seat], newest: dict[int, Message], unread: dict[int, int]
) -> list[ConversationOut]:
    """
    Chats as the viewer sees them, all at once with a handful of queries: one by one, a list
    of 100 chats took about 940, each a round trip to PostgreSQL in production (step 10).
    """
    others = [s.other.id for s in seats if s.other is not None]
    settings = {row.user_id: row for row in db.scalars(select(UserSettings).where(UserSettings.user_id.in_([viewer.id, *others])))}

    def receipts(user_id) -> bool:
        return settings[user_id].read_receipts if user_id in settings else True

    # How far the other person has read: only when you both have read receipts on
    their_read: dict[int, int] = {}
    if others and receipts(viewer.id):
        their_read = dict(
            db.execute(
                select(ConversationMember.conversation_id, ConversationMember.last_read_message_id).where(
                    ConversationMember.conversation_id.in_([s.conversation.id for s in seats if s.other is not None]),
                    ConversationMember.user_id != viewer.id,
                )
            ).all()
        )
    trip_ids = [s.conversation.trip_id for s in seats if s.conversation.kind == "trip"]
    trips = {t.id: t for t in db.scalars(select(Trip).where(Trip.id.in_(trip_ids)))} if trip_ids else {}
    shown = {
        s.conversation.id: m for s in seats if (m := newest.get(s.conversation.id)) is not None and m.id > s.member.cleared_up_to_id
    }
    rendered = {m.id: m for m in cards.render(db, list(shown.values()), viewer.id)} if shown else {}
    out = []
    for s in seats:
        c = s.conversation
        trip = trips.get(c.trip_id) if c.kind == "trip" else None
        last = shown.get(c.id)
        out.append(ConversationOut(
            id=c.id,
            kind=c.kind,
            other=_public(s.other) if s.other is not None else None,
            trip_id=c.trip_id,
            trip=RoomTripOut(**rooms.room_trip(db, trip)) if trip is not None else None,
            members=[_public(u) for u in rooms.room_people(db, trip)] if trip is not None else [],
            can_send=s.can_send,
            read_only_reason=s.read_only_reason,
            last_message=rendered[last.id] if last is not None else None,
            unread_count=unread.get(c.id, 0),
            last_read_message_id=s.member.last_read_message_id,
            other_read_up_to=their_read.get(c.id) if s.other is not None and receipts(viewer.id) and receipts(s.other.id) else None,
            muted_until=s.member.muted_until,
            created_at=c.created_at,
        ))
    return out


def _one(db: Session, viewer: User, s: chat.Seat) -> ConversationOut:
    newest, unread = chat.summaries(db, viewer.id, [s.conversation.id])
    return _conversations_out(db, viewer, [s], newest, unread)[0]


def _naive_utc(value: datetime) -> datetime:
    """Times are stored as naive UTC."""
    return value.astimezone(timezone.utc).replace(tzinfo=None) if value.tzinfo else value


# ---------------------------------------------------------------------------
# Conversations
# ---------------------------------------------------------------------------

@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Your chats that have a message you can see, newest first. Empty chats and cleared ones wait for a message."""
    members = db.scalars(select(ConversationMember).where(ConversationMember.user_id == viewer.id)).all()
    newest, unread = chat.summaries(db, viewer.id, [m.conversation_id for m in members])
    listed = [m for m in members if (last := newest.get(m.conversation_id)) is not None and last.id > m.cleared_up_to_id]
    seats = chat.seats(db, viewer, listed)  # leaves out chats with someone you blocked
    out = _conversations_out(db, viewer, [seats[m.conversation_id] for m in listed if m.conversation_id in seats], newest, unread)
    return sorted(out, key=lambda c: c.last_message.id, reverse=True)


@router.post("/conversations/direct", response_model=ConversationOut)
def open_direct(payload: DirectIn, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The chat with a friend; made the first time either of you opens it. Anyone who isn't a friend: 404."""
    other = db.get(User, payload.user_id)
    if (
        other is None
        or other.id == viewer.id
        or social.friendship(db, viewer.id, other.id) is None
        or social.blocked_either_way(db, viewer.id, other.id)
    ):
        raise NOT_FOUND
    conversation = chat.open_direct(db, viewer.id, other.id)
    return _one(db, viewer, _seat(db, conversation.id, viewer))


@router.get("/conversations/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _one(db, viewer, _seat(db, conversation_id, viewer))


@router.patch("/conversations/{conversation_id}/me", response_model=ConversationOut)
def update_my_state(
    conversation_id: int, payload: MemberStateIn, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """Mute (or unmute with null), or "delete chat" for you only: nobody else's copy changes."""
    s = _seat(db, conversation_id, viewer)
    if "muted_until" in payload.model_fields_set:
        s.member.muted_until = _naive_utc(payload.muted_until) if payload.muted_until else None
    if payload.cleared_up_to_id is not None:
        if payload.cleared_up_to_id > chat.latest_id(db, conversation_id):
            raise HTTPException(status_code=422, detail="There are no messages up to that id yet")
        s.member.cleared_up_to_id = max(s.member.cleared_up_to_id, payload.cleared_up_to_id)
    db.commit()
    live.conversation_updated([viewer.id], conversation_id)
    return _one(db, viewer, s)


@router.post("/conversations/{conversation_id}/read", status_code=204)
def mark_read(conversation_id: int, payload: ReadIn, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Read up to a message. Allowed in a read-only chat too."""
    s = _seat(db, conversation_id, viewer)
    before = s.member.last_read_message_id
    chat.mark_read(db, s, payload.message_id)
    db.commit()
    if s.member.last_read_message_id != before:
        live.conversation_read(db, conversation_id, viewer.id, s.member.last_read_message_id)
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Messages
# ---------------------------------------------------------------------------

@router.get("/conversations/{conversation_id}/messages", response_model=MessagePageOut)
def list_messages(
    conversation_id: int,
    before: Optional[int] = Query(None, ge=1, description="Older than this message id (paging back)"),
    after: Optional[int] = Query(None, ge=0, description="Newer than this message id (catching up)"),
    limit: int = Query(PAGE_SIZE, ge=1, le=100),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The newest messages, or a page before or after a message id; oldest first."""
    if before is not None and after is not None:
        raise HTTPException(status_code=422, detail="Use either before or after, not both")
    s = _seat(db, conversation_id, viewer)
    if s.conversation.kind == "trip":
        live.purge_expired_live(db)  # a live location that ran out is gone before anyone reads the room
    rows, more = chat.page(db, s, before=before, after=after, limit=limit)
    return MessagePageOut(messages=cards.render(db, rows, viewer.id), has_more=more)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut, status_code=201)
@limiter.limit(CHAT_SEND_LIMIT, key_func=user_or_ip)
def send_message(
    request: Request,  # required by the rate limiter
    response: Response,
    background: BackgroundTasks,
    conversation_id: int,
    payload: MessageIn,
    viewer: User = Depends(_sender),
    db: Session = Depends(get_db),
):
    """
    Send text, or a card: a trip, a place, a trip idea or a poll (`kind` and `payload`;
    the server builds the card from what it points at). A retry with the same client_id
    returns the first message (200 instead of 201), even if the chat has become read-only since.
    """
    s = _seat(db, conversation_id, viewer)
    client_id = str(payload.client_id)
    earlier = db.scalar(select(Message).where(Message.sender_id == viewer.id, Message.client_id == client_id))
    if earlier is not None:
        if earlier.conversation_id != conversation_id:
            raise HTTPException(status_code=409, detail="That client_id was already used in another chat")
        response.status_code = 200
        return cards.render(db, [earlier], viewer.id)[0]
    if not s.can_send:
        raise HTTPException(status_code=403, detail="You can only message your friends")
    if payload.reply_to_id is not None:
        try:
            cards.check_reply(db, conversation_id, s.member.cleared_up_to_id, payload.reply_to_id)
        except cards.CardError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.detail) from None
    card = None
    if payload.kind != "text":
        try:
            others = [s.other] if s.other is not None else chat.room_members(db, conversation_id, viewer.id)
            room_trip = db.get(Trip, s.conversation.trip_id) if s.conversation.kind == "trip" else None
            card = cards.snapshot(db, viewer, others, payload.kind, payload.card(), room_trip=room_trip)
        except cards.CardError as exc:
            raise HTTPException(status_code=exc.status, detail=exc.detail) from None
    message = Message(
        conversation_id=conversation_id, sender_id=viewer.id, client_id=client_id, kind=payload.kind, body=payload.body, payload=card,
        reply_to_id=payload.reply_to_id,
    )
    db.add(message)
    try:
        db.commit()
    except IntegrityError:  # the same retry arrived twice at once
        db.rollback()
        earlier = db.scalar(select(Message).where(Message.sender_id == viewer.id, Message.client_id == client_id))
        if earlier is None or earlier.conversation_id != conversation_id:
            raise
        response.status_code = 200
        return cards.render(db, [earlier], viewer.id)[0]
    db.refresh(message)
    live.message_created(db, message)
    chat_push.notify_message(background, db, message)  # after the response (step 9)
    return cards.render(db, [message], viewer.id)[0]


@router.delete("/conversations/{conversation_id}/messages/{message_id}", status_code=204)
def unsend_message(conversation_id: int, message_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unsend for everyone: your own message, within an hour (decision C2). It stays as "message removed"."""
    _seat(db, conversation_id, viewer)
    message = db.get(Message, message_id)
    if message is None or message.conversation_id != conversation_id:
        raise NOT_FOUND
    if message.sender_id != viewer.id:
        raise HTTPException(status_code=403, detail="You can only unsend your own messages")
    if message.deleted_at is None:
        if datetime.utcnow() - message.created_at > chat.UNSEND_WINDOW:
            raise HTTPException(status_code=403, detail="A message can only be unsent within an hour of sending it")
        message.deleted_at = datetime.utcnow()
        message.body = None
        message.payload = None
        cards.forget_votes(db, message)
        db.commit()
        live.message_updated(db, message)
    return Response(status_code=204)


@router.put("/conversations/{conversation_id}/messages/{message_id}/vote", response_model=MessageOut)
@limiter.limit(CHAT_VOTE_LIMIT, key_func=user_or_ip)
def vote(
    request: Request,  # required by the rate limiter
    conversation_id: int,
    message_id: int,
    payload: VoteIn,
    viewer: User = Depends(_sender),
    db: Session = Depends(get_db),
):
    """
    Answer a poll (one option, or several when it allows that) or a trip idea
    (1 in, 2 maybe, 3 can't). Your new answer replaces the old; `[]` takes it back.
    """
    s = _seat(db, conversation_id, viewer)
    message = db.get(Message, message_id)
    if message is None or message.conversation_id != conversation_id or message.id <= s.member.cleared_up_to_id:
        raise NOT_FOUND
    if not s.can_send:
        raise HTTPException(status_code=403, detail="You can only answer in a chat with a friend")
    try:
        cards.vote(db, message, viewer, payload.option_ids)
    except cards.CardError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None
    db.commit()
    live.message_updated(db, message)
    return cards.render(db, [message], viewer.id)[0]


def _message_in(db: Session, s: chat.Seat, message_id: int) -> Message:
    """A message of this chat that the member can see (not one they cleared)."""
    message = db.get(Message, message_id)
    if message is None or message.conversation_id != s.conversation.id or message.id <= s.member.cleared_up_to_id:
        raise NOT_FOUND
    return message


def _set_reaction(db: Session, conversation_id: int, message_id: int, viewer: User, reaction: Optional[str]) -> MessageOut:
    s = _seat(db, conversation_id, viewer)
    message = _message_in(db, s, message_id)
    if not s.can_send:
        raise HTTPException(status_code=403, detail="You can only react in a chat with a friend")
    try:
        cards.react(db, message, viewer, reaction)
    except cards.CardError as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from None
    db.commit()
    live.message_updated(db, message)
    return cards.render(db, [message], viewer.id)[0]


@router.put("/conversations/{conversation_id}/messages/{message_id}/reaction", response_model=MessageOut)
@limiter.limit(CHAT_VOTE_LIMIT, key_func=user_or_ip)
def react(
    request: Request,  # required by the rate limiter
    conversation_id: int,
    message_id: int,
    payload: ReactionIn,
    viewer: User = Depends(_sender),
    db: Session = Depends(get_db),
):
    """Your one reaction (heart, thumbs_up, laugh, wow; want for places and trip ideas). A new one replaces it."""
    return _set_reaction(db, conversation_id, message_id, viewer, payload.reaction)


@router.delete("/conversations/{conversation_id}/messages/{message_id}/reaction", response_model=MessageOut)
@limiter.limit(CHAT_VOTE_LIMIT, key_func=user_or_ip)
def unreact(request: Request, conversation_id: int, message_id: int, viewer: User = Depends(_sender), db: Session = Depends(get_db)):
    """Take your reaction back."""
    return _set_reaction(db, conversation_id, message_id, viewer, None)


@router.post("/messages/{message_id}/report", status_code=201)
@limiter.limit(CHAT_REPORT_LIMIT, key_func=user_or_ip)
def report_message(
    request: Request,  # required by the rate limiter
    response: Response,
    message_id: int,
    payload: ReportIn,
    viewer: User = Depends(_sender),
    db: Session = Depends(get_db),
):
    """
    Report someone else's message in a chat you're in (also a read-only one). What it
    said is kept with the report, even if it's unsent later. Reporting it again
    returns the first report (200).
    """
    message = db.get(Message, message_id)
    if message is None:
        raise NOT_FOUND
    s = _seat(db, message.conversation_id, viewer)
    _message_in(db, s, message_id)
    if message.sender_id is None or message.sender_id == viewer.id:
        raise HTTPException(status_code=422, detail="You can only report other people's messages")
    if message.deleted_at is not None:
        raise HTTPException(status_code=409, detail="This was unsent")
    earlier = db.scalar(select(MessageReport).where(MessageReport.message_id == message.id, MessageReport.reporter_id == viewer.id))
    if earlier is not None:
        response.status_code = 200
        return {"id": earlier.id, "status": earlier.status}
    report = MessageReport(
        message_id=message.id,
        conversation_id=message.conversation_id,
        reporter_id=viewer.id,
        reported_user_id=message.sender_id,
        reason=payload.reason,
        note=payload.note,
        snapshot={
            "kind": message.kind,
            "body": message.body,
            "payload": message.payload,
            "sender_id": str(message.sender_id),
            "sent_at": message.created_at.isoformat(),
        },
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:  # the same report twice at once
        db.rollback()
        earlier = db.scalar(select(MessageReport).where(MessageReport.message_id == message.id, MessageReport.reporter_id == viewer.id))
        response.status_code = 200
        return {"id": earlier.id, "status": earlier.status}
    return {"id": report.id, "status": report.status}


@router.post("/me/chats/clear")
def clear_all_chats(viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    "Delete all my chats" (Settings → Chats and privacy): every chat is cleared for
    you, as "Delete chat" does for one. Nobody else's copy changes.
    """
    cleared = []
    for member in db.scalars(select(ConversationMember).where(ConversationMember.user_id == viewer.id)):
        newest = chat.latest_id(db, member.conversation_id)
        if newest > member.cleared_up_to_id:
            member.cleared_up_to_id = newest
            cleared.append(member.conversation_id)
    db.commit()
    for conversation_id in cleared:
        live.conversation_updated([viewer.id], conversation_id)
    return {"cleared": len(cleared)}


@router.get("/admin/reports", response_model=List[ReportOut])
def list_reports(
    status: Optional[str] = Query("open", description="open, or all"),
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    """Reported messages, newest first (X-Admin-Token)."""
    query = select(MessageReport).order_by(MessageReport.id.desc()).limit(200)
    if status != "all":
        query = query.where(MessageReport.status == status)
    return db.scalars(query).all()
