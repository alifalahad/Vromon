"""
Vromon Backend — chat between friends (docs/friends-chat-plan.md, section 3.4).

Who may do what, enforced by the chat endpoints:
- a conversation is visible only to its members; anyone else gets 404;
- in a direct chat, someone who blocked the other person no longer sees it (404);
- without a friendship (unfriended, or blocked by the other person, which isn't
  revealed) a direct chat is read-only, as is a chat whose other account is gone;
- a trip room (step 7, services/rooms.py) is open to its owner and joined members,
  and messages from someone you blocked are hidden there for you.

SQLite doesn't enforce ON DELETE, so chat data is deleted explicitly here.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal, Optional

from sqlalchemy import and_, delete, exists, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.models import (
    Block, Conversation, ConversationMember, LiveLocation, Message, MessageReaction, MessageReport, PollVote, TripSuggestion, User,
    UserSettings,
)
from app.services.friends import friend_ids, friendship, ordered

# Decision C2
UNSEND_WINDOW = timedelta(hours=1)

ReadOnlyReason = Literal["not_friends", "account_deleted"]


@dataclass
class Seat:
    """A member's place in a conversation: what they may do there."""
    conversation: Conversation
    member: ConversationMember
    # A direct chat's other person (None when their account was deleted)
    other: Optional[User]
    can_send: bool
    read_only_reason: Optional[ReadOnlyReason] = None


def direct_key(a: uuid.UUID, b: uuid.UUID) -> str:
    x, y = ordered(a, b)
    return f"{x.hex}:{y.hex}"


def open_direct(db: Session, a: uuid.UUID, b: uuid.UUID) -> Conversation:
    """The pair's chat, made the first time either of them opens it. Commits when it's new."""
    key = direct_key(a, b)
    existing = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    if existing is not None:
        return existing
    conversation = Conversation(kind="direct", direct_key=key)
    try:
        db.add(conversation)
        db.flush()
        db.add_all([ConversationMember(conversation_id=conversation.id, user_id=uid) for uid in (a, b)])
        db.commit()
    except IntegrityError:  # the other person opened it at the same moment
        db.rollback()
        existing = db.scalar(select(Conversation).where(Conversation.direct_key == key))
        if existing is None:
            raise
        return existing
    return conversation


def seat(db: Session, conversation_id: int, viewer: User) -> Optional[Seat]:
    """The viewer's place in a conversation, or None when they may not see it."""
    member = db.get(ConversationMember, (conversation_id, viewer.id))
    if member is None:
        return None
    conversation = db.get(Conversation, conversation_id)
    if conversation.kind == "trip":
        # Members only: leaving, or being removed, takes the membership away
        return Seat(conversation, member, None, can_send=True)
    other_id = db.scalar(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id, ConversationMember.user_id != viewer.id
        )
    )
    other = db.get(User, other_id) if other_id is not None else None
    if other is None:
        return Seat(conversation, member, None, can_send=False, read_only_reason="account_deleted")
    if db.get(Block, (viewer.id, other.id)) is not None:
        return None
    # Blocking ends the friendship too, so being blocked reads as "not friends"
    if friendship(db, viewer.id, other.id) is None:
        return Seat(conversation, member, other, can_send=False, read_only_reason="not_friends")
    return Seat(conversation, member, other, can_send=True)


def seats(db: Session, viewer: User, members: list[ConversationMember]) -> dict[int, Seat]:
    """
    `seat` for many conversations at once (the chat list), by conversation id, with the same
    rules: a few queries in all instead of a few per chat (step 10). Left out: chats the
    viewer may not see (they blocked the other person).
    """
    ids = [m.conversation_id for m in members]
    if not ids:
        return {}
    conversations = {c.id: c for c in db.scalars(select(Conversation).where(Conversation.id.in_(ids)))}
    direct = [cid for cid, c in conversations.items() if c.kind == "direct"]
    other_of = dict(
        db.execute(
            select(ConversationMember.conversation_id, ConversationMember.user_id).where(
                ConversationMember.conversation_id.in_(direct), ConversationMember.user_id != viewer.id
            )
        ).all()
    ) if direct else {}
    users = {u.id: u for u in db.scalars(select(User).where(User.id.in_(set(other_of.values()))))} if other_of else {}
    blocked = set(db.scalars(select(Block.blocked_id).where(Block.blocker_id == viewer.id)))
    friends = {fid for fid, _ in friend_ids(db, viewer.id)}
    out: dict[int, Seat] = {}
    for member in members:
        conversation = conversations.get(member.conversation_id)
        if conversation is None:
            continue
        if conversation.kind == "trip":
            out[conversation.id] = Seat(conversation, member, None, can_send=True)
            continue
        other = users.get(other_of.get(conversation.id))
        if other is None:
            out[conversation.id] = Seat(conversation, member, None, can_send=False, read_only_reason="account_deleted")
        elif other.id in blocked:
            continue
        elif other.id not in friends:
            out[conversation.id] = Seat(conversation, member, other, can_send=False, read_only_reason="not_friends")
        else:
            out[conversation.id] = Seat(conversation, member, other, can_send=True)
    return out


def not_blocked_by(viewer_id: uuid.UUID):
    """Messages the viewer may see: not from someone they blocked (lines from Vromon have no sender)."""
    return or_(Message.sender_id.is_(None), Message.sender_id.not_in(select(Block.blocked_id).where(Block.blocker_id == viewer_id)))


def room_members(db: Session, conversation_id: int, but: uuid.UUID) -> list[User]:
    """Everyone else in a chat (for a trip card: they must all be able to see the trip)."""
    ids = db.scalars(
        select(ConversationMember.user_id).where(ConversationMember.conversation_id == conversation_id, ConversationMember.user_id != but)
    ).all()
    return [u for u in (db.get(User, uid) for uid in ids) if u is not None]


def latest_id(db: Session, conversation_id: int) -> int:
    return db.scalar(select(func.max(Message.id)).where(Message.conversation_id == conversation_id)) or 0


def page(db: Session, s: Seat, *, before: Optional[int], after: Optional[int], limit: int) -> tuple[list[Message], bool]:
    """A page of the messages the member can see, oldest first, and whether there are more that way."""
    visible = select(Message).where(
        Message.conversation_id == s.conversation.id, Message.id > s.member.cleared_up_to_id, not_blocked_by(s.member.user_id)
    )
    if after is not None:
        rows = db.scalars(visible.where(Message.id > after).order_by(Message.id).limit(limit + 1)).all()
        return list(rows[:limit]), len(rows) > limit
    if before is not None:
        visible = visible.where(Message.id < before)
    rows = db.scalars(visible.order_by(Message.id.desc()).limit(limit + 1)).all()
    return list(reversed(rows[:limit])), len(rows) > limit


def summaries(db: Session, viewer_id: uuid.UUID, conversation_ids: list[int]) -> tuple[dict[int, Message], dict[int, int]]:
    """Each conversation's newest message, and how many messages the viewer hasn't read yet."""
    if not conversation_ids:
        return {}, {}
    newest = dict(
        db.execute(
            select(Message.conversation_id, func.max(Message.id))
            .where(Message.conversation_id.in_(conversation_ids), not_blocked_by(viewer_id))
            .group_by(Message.conversation_id)
        ).all()
    )
    by_id = {m.id: m for m in db.scalars(select(Message).where(Message.id.in_(list(newest.values()))))}
    me = ConversationMember
    unread = dict(
        db.execute(
            select(Message.conversation_id, func.count(Message.id))
            .join(me, and_(me.conversation_id == Message.conversation_id, me.user_id == viewer_id))
            .where(
                Message.conversation_id.in_(conversation_ids),
                Message.id > me.last_read_message_id,
                Message.id > me.cleared_up_to_id,
                # Not your own, not unsent, not a line from Vromon (a null sender fails this too)
                Message.sender_id != viewer_id,
                Message.deleted_at.is_(None),
                Message.kind != "system",
                not_blocked_by(viewer_id),
            )
            .group_by(Message.conversation_id)
        ).all()
    )
    return {cid: by_id[mid] for cid, mid in newest.items()}, unread


def receipts_on(db: Session, user_id: uuid.UUID) -> bool:
    row = db.get(UserSettings, user_id)
    return row.read_receipts if row is not None else True


def mark_read(db: Session, s: Seat, message_id: int) -> None:
    """Read up to a message (never past the newest one, never backwards)."""
    target = min(message_id, latest_id(db, s.conversation.id))
    if target > s.member.last_read_message_id:
        s.member.last_read_message_id = target


def post_system_message(db: Session, conversation: Conversation, event: str, data: Optional[dict] = None) -> Message:
    """A line from Vromon itself in a chat ("Nusrat joined", "You added X to Day 2"). Doesn't commit."""
    message = Message(conversation_id=conversation.id, kind="system", payload={"event": event, **(data or {})})
    db.add(message)
    db.flush()
    return message


def partners(db: Session, user_id: uuid.UUID) -> list[tuple[int, uuid.UUID]]:
    """(conversation id, other member) for every chat the user is in."""
    mine = select(ConversationMember.conversation_id).where(ConversationMember.user_id == user_id).scalar_subquery()
    rows = db.execute(
        select(ConversationMember.conversation_id, ConversationMember.user_id).where(
            ConversationMember.conversation_id.in_(mine), ConversationMember.user_id != user_id
        )
    ).all()
    return [(cid, uid) for cid, uid in rows]


def export_chats(db: Session, user_id: uuid.UUID) -> list[dict]:
    """For /me/export: the chats you're in and the messages you sent (other people's messages are theirs)."""
    out = []
    for member in db.scalars(select(ConversationMember).where(ConversationMember.user_id == user_id)):
        conversation = db.get(Conversation, member.conversation_id)
        others = db.scalars(
            select(User.username)
            .join(ConversationMember, ConversationMember.user_id == User.id)
            .where(ConversationMember.conversation_id == conversation.id, ConversationMember.user_id != user_id)
        ).all()
        sent = db.scalars(
            select(Message).where(Message.conversation_id == conversation.id, Message.sender_id == user_id).order_by(Message.id)
        ).all()
        out.append({
            "kind": conversation.kind,
            "with": [u for u in others if u],
            "trip_id": conversation.trip_id,
            "joined_at": member.joined_at.isoformat(),
            "messages_you_sent": [
                {"sent_at": m.created_at.isoformat(), "kind": m.kind, "text": m.body, "card": m.payload, "unsent": m.deleted_at is not None}
                for m in sent
            ],
        })
    return out


def delete_chat_data(db: Session, user_id: uuid.UUID) -> None:
    """Everything chat about a user, for account deletion: their messages, reactions, votes, reports and memberships."""
    # Their live location, if they were sharing one (step 8)
    db.execute(delete(LiveLocation).where(LiveLocation.user_id == user_id))
    # Reports they made, and reports about them (which hold their words)
    db.execute(delete(MessageReport).where(or_(MessageReport.reporter_id == user_id, MessageReport.reported_user_id == user_id)))
    theirs = select(Message.id).where(Message.sender_id == user_id).scalar_subquery()
    db.execute(delete(MessageReaction).where(or_(MessageReaction.user_id == user_id, MessageReaction.message_id.in_(theirs))))
    db.execute(delete(PollVote).where(or_(PollVote.user_id == user_id, PollVote.message_id.in_(theirs))))
    # What the owner decided about places they suggested in friends' trip rooms (step 7). The
    # stops stay in the plan; SQLite can give a deleted message's id to a new one, which mustn't inherit this
    db.execute(delete(TripSuggestion).where(TripSuggestion.message_id.in_(theirs)))
    db.execute(update(Message).where(Message.reply_to_id.in_(theirs)).values(reply_to_id=None))
    db.execute(delete(Message).where(Message.sender_id == user_id))
    db.execute(delete(ConversationMember).where(ConversationMember.user_id == user_id))
    # A chat nobody is in any more goes too
    empty = db.scalars(
        select(Conversation.id).where(~exists().where(ConversationMember.conversation_id == Conversation.id))
    ).all()
    if empty:
        in_empty = select(Message.id).where(Message.conversation_id.in_(empty)).scalar_subquery()
        db.execute(delete(MessageReaction).where(MessageReaction.message_id.in_(in_empty)))
        db.execute(delete(PollVote).where(PollVote.message_id.in_(in_empty)))
        db.execute(update(MessageReport).where(MessageReport.conversation_id.in_(empty)).values(conversation_id=None, message_id=None))
        db.execute(delete(Message).where(Message.conversation_id.in_(empty)))
        db.execute(delete(Conversation).where(Conversation.id.in_(empty)))
