"""
Vromon Backend — friendships, requests and blocks (prompt §6.3–6.4).

A friendship is stored once, smaller user id first (`ordered`). Blocking removes
the friendship and any pending requests, and hides the two users from each other.
"""

from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.orm import Session

from app.models.models import Block, FriendRequest, Friendship, User

Relation = Literal["self", "none", "requested", "incoming", "friends"]


def ordered(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """The pair as stored: by hex, which is the byte order SQLite and PostgreSQL compare by."""
    return (a, b) if a.hex < b.hex else (b, a)


def friendship(db: Session, a: uuid.UUID, b: uuid.UUID) -> Friendship | None:
    x, y = ordered(a, b)
    return db.get(Friendship, (x, y))


def blocked_either_way(db: Session, a: uuid.UUID, b: uuid.UUID) -> bool:
    return db.scalar(
        select(Block.blocker_id).where(
            or_(and_(Block.blocker_id == a, Block.blocked_id == b), and_(Block.blocker_id == b, Block.blocked_id == a))
        ).limit(1)
    ) is not None


def pending_request(db: Session, from_id: uuid.UUID, to_id: uuid.UUID) -> FriendRequest | None:
    return db.scalar(
        select(FriendRequest).where(
            FriendRequest.from_user_id == from_id, FriendRequest.to_user_id == to_id, FriendRequest.status == "pending"
        )
    )


def relation(db: Session, viewer: User, other: User) -> tuple[Relation, int | None]:
    """How `other` relates to the viewer, and the pending request id if there is one."""
    if viewer.id == other.id:
        return "self", None
    if friendship(db, viewer.id, other.id):
        return "friends", None
    if (out := pending_request(db, viewer.id, other.id)) is not None:
        return "requested", out.id
    if (inc := pending_request(db, other.id, viewer.id)) is not None:
        return "incoming", inc.id
    return "none", None


def befriend(db: Session, a: uuid.UUID, b: uuid.UUID) -> None:
    if friendship(db, a, b) is None:
        x, y = ordered(a, b)
        db.add(Friendship(user_a_id=x, user_b_id=y))


def unfriend(db: Session, a: uuid.UUID, b: uuid.UUID) -> bool:
    x, y = ordered(a, b)
    return db.execute(delete(Friendship).where(Friendship.user_a_id == x, Friendship.user_b_id == y)).rowcount > 0


def cancel_pending_between(db: Session, a: uuid.UUID, b: uuid.UUID) -> None:
    db.execute(
        update(FriendRequest)
        .where(
            FriendRequest.status == "pending",
            or_(
                and_(FriendRequest.from_user_id == a, FriendRequest.to_user_id == b),
                and_(FriendRequest.from_user_id == b, FriendRequest.to_user_id == a),
            ),
        )
        .values(status="cancelled")
    )


def friend_ids(db: Session, user_id: uuid.UUID) -> list[tuple[uuid.UUID, object]]:
    """(friend id, friends since) for every friend of `user_id`."""
    rows = db.execute(
        select(Friendship.user_a_id, Friendship.user_b_id, Friendship.created_at).where(
            or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id)
        )
    ).all()
    return [(b if a == user_id else a, since) for a, b, since in rows]


def delete_social_data(db: Session, user_id: uuid.UUID) -> None:
    """Everything social about a user, for account deletion."""
    db.execute(delete(FriendRequest).where(or_(FriendRequest.from_user_id == user_id, FriendRequest.to_user_id == user_id)))
    db.execute(delete(Friendship).where(or_(Friendship.user_a_id == user_id, Friendship.user_b_id == user_id)))
    db.execute(delete(Block).where(or_(Block.blocker_id == user_id, Block.blocked_id == user_id)))
