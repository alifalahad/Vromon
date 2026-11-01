#!/usr/bin/env python3
"""
A long chat and a long chat list for the performance check (docs/friends-chat-plan.md,
step 10), written straight into the dev database for a test account, never the owner's:

    cd backend && venv/bin/python ../scripts/dev/seed_chat_perf.py add A      # e2e.ana: 2,000 messages with one friend, 99 more chats
    cd backend && venv/bin/python ../scripts/dev/seed_chat_perf.py remove     # every made-up person, and everything they had

The other people are made-up accounts (auth subject "perf-seed-…", no sign-in), each the
test account's friend. The long chat spans 40 days: runs of messages from each side, some in
Bangla, a place card or a poll now and then, replies and reactions. Run it with the dev backend
stopped or idle: SQLite takes one writer at a time.
"""

from __future__ import annotations

import random
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import delete, select, update  # noqa: E402

from app.core.auth import new_friend_code  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    Conversation, ConversationMember, Message, MessageReaction, MessageReport, Place, PollVote, User,
)
from app.services import cards, chat, rooms  # noqa: E402
from app.services import friends as social  # noqa: E402
from app.schemas.chat import PlaceCardIn, PollCardIn  # noqa: E402

SUBJECT = "perf-seed-"
LONG_CHAT = 2000
MORE_CHATS = 99

LINES = [
    "Are we still on for Saturday?", "Bus at 7 from Sayedabad", "I'll bring the tea", "Running a bit late, 10 min",
    "Look at this view!", "Did you book the hotel?", "Yes, two rooms near the beach", "Let's leave early, the road is long",
    "সকাল ৭টায় বাস", "চলো সিলেট যাই", "আমি আসছি", "ঠিক আছে, দেখা হবে", "What time does the boat leave?",
    "The guide said 9:30 at the jetty, and we should bring cash because there's no card machine there.",
    "Ok", "👍", "Haha", "Send me the photos later", "It's raining here, keep an umbrella",
    "Tickets are 450 each; I paid for both, you can send me yours whenever",
]


def _account(which: str) -> str:
    for line in (ROOT / ".env.e2e.local").read_text().splitlines():
        if line.startswith(f"E2E_{which}_USERNAME="):
            return line.split("=", 1)[1].strip()
    raise SystemExit(f"No E2E_{which}_USERNAME in .env.e2e.local")


def _person(db, n: str, name: str) -> User:
    user = User(auth_subject=f"{SUBJECT}{uuid.uuid4()}", friend_code=new_friend_code(), username=f"perf_{n}", display_name=name)
    db.add(user)
    db.flush()
    return user


def _say(db, conversation_id: int, sender: User, at: datetime, text: str, reply_to: int | None = None) -> Message:
    m = Message(conversation_id=conversation_id, sender_id=sender.id, client_id=str(uuid.uuid4()), kind="text", body=text,
                reply_to_id=reply_to, created_at=at)
    db.add(m)
    return m


def add(which: str) -> None:
    rng = random.Random(10)
    with SessionLocal() as db:
        me = db.scalar(select(User).where(User.username == _account(which)))
        if me is None:
            raise SystemExit("The test account isn't in this database")
        if db.scalar(select(User).where(User.auth_subject.startswith(SUBJECT))) is not None:
            raise SystemExit("Already seeded: run `remove` first")
        place = db.scalars(select(Place).where(Place.is_active.is_(True))).first()
        now = datetime.utcnow()

        # The long chat
        pal = _person(db, "pal", "Perf Pal")
        social.befriend(db, me.id, pal.id)
        db.flush()
        long_chat = chat.open_direct(db, me.id, pal.id)
        at = now - timedelta(days=40)
        step = timedelta(days=40) / LONG_CHAT
        sent: list[Message] = []
        sender = pal
        while len(sent) < LONG_CHAT:
            for _ in range(rng.randint(1, 4)):  # a run from one side
                at += step * rng.uniform(0.2, 1.8)
                n = len(sent)
                if n % 97 == 50 and place is not None:
                    payload = cards.snapshot(db, sender, [me if sender is pal else pal], "place", PlaceCardIn(type="attraction", ref=str(place.id)))
                    m = Message(conversation_id=long_chat.id, sender_id=sender.id, client_id=str(uuid.uuid4()), kind="place", payload=payload, created_at=at)
                    db.add(m)
                elif n % 211 == 100:
                    payload = cards.snapshot(db, sender, [], "poll", PollCardIn(question="Which weekend?", options=["3–5 Dec", "10–12 Dec", "17–19 Dec"]))
                    m = Message(conversation_id=long_chat.id, sender_id=sender.id, client_id=str(uuid.uuid4()), kind="poll", payload=payload, created_at=at)
                    db.add(m)
                else:
                    reply = sent[-rng.randint(2, 6)].id if n % 23 == 0 and len(sent) > 6 else None
                    m = _say(db, long_chat.id, sender, at, rng.choice(LINES), reply_to=reply)
                db.flush()
                sent.append(m)
                if n % 19 == 0:
                    db.add(MessageReaction(message_id=m.id, user_id=(me if sender is pal else pal).id, reaction=rng.choice(["heart", "thumbs_up", "laugh"])))
                if len(sent) >= LONG_CHAT:
                    break
            sender = me if sender is pal else pal
        db.get(ConversationMember, (long_chat.id, me.id)).last_read_message_id = sent[-4].id
        db.get(ConversationMember, (long_chat.id, pal.id)).last_read_message_id = sent[-1].id

        # Many chats, a few messages each, newest a minute to 60 days ago
        for i in range(1, MORE_CHATS + 1):
            other = _person(db, f"{i:03d}", f"Perf Friend {i:03d}")
            social.befriend(db, me.id, other.id)
            db.flush()
            c = chat.open_direct(db, me.id, other.id)
            last_at = now - timedelta(minutes=rng.randint(1, 60 * 24 * 60))
            last = None
            for k in range(rng.randint(1, 5), 0, -1):
                last = _say(db, c.id, rng.choice([me, other]), last_at - timedelta(minutes=k * 7), rng.choice(LINES))
            db.flush()
            if rng.random() < 0.7:
                db.get(ConversationMember, (c.id, me.id)).last_read_message_id = last.id
        db.commit()
        print(f"Added a {LONG_CHAT}-message chat ({long_chat.id}) and {MORE_CHATS} more chats for {which}")


def _drop_chat(db, conversation_id: int) -> None:
    """The whole chat, the test account's side included (it was only ever test data)."""
    ids = select(Message.id).where(Message.conversation_id == conversation_id).scalar_subquery()
    db.execute(delete(MessageReaction).where(MessageReaction.message_id.in_(ids)))
    db.execute(delete(PollVote).where(PollVote.message_id.in_(ids)))
    db.execute(update(MessageReport).where(MessageReport.conversation_id == conversation_id).values(conversation_id=None, message_id=None))
    db.execute(update(Message).where(Message.conversation_id == conversation_id).values(reply_to_id=None))
    db.execute(delete(Message).where(Message.conversation_id == conversation_id))
    db.execute(delete(ConversationMember).where(ConversationMember.conversation_id == conversation_id))
    db.execute(delete(Conversation).where(Conversation.id == conversation_id))


def remove() -> None:
    with SessionLocal() as db:
        people = db.scalars(select(User).where(User.auth_subject.startswith(SUBJECT))).all()
        chats = {cid for user in people for cid, _ in chat.partners(db, user.id)}
        for conversation_id in chats:
            _drop_chat(db, conversation_id)
        for user in people:
            rooms.delete_user_rooms(db, user.id)
            chat.delete_chat_data(db, user.id)
            social.delete_social_data(db, user.id)
            db.delete(user)
        db.commit()
        print(f"Removed {len(people)} made-up people and their {len(chats)} chats")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "add":
        add(sys.argv[2])
    elif len(sys.argv) == 2 and sys.argv[1] == "remove":
        remove()
    else:
        raise SystemExit(__doc__)
