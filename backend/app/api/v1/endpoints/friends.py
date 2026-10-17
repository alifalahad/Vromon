"""
Vromon API v1 — friends (prompt §6.4, §8).

GET /users/search · GET /friend-codes/{code} · POST /me/friend-code/rotate ·
POST/GET /friend-requests · POST /friend-requests/{id}/accept|decline|cancel ·
GET /friends · DELETE /friends/{user_id} · GET/POST /blocks · DELETE /blocks/{user_id} ·
POST /me/devices · DELETE /me/devices/{token}

Anything that would reveal a user the viewer may not see answers 404.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.v1.endpoints.me import _me_out
from app.core.auth import FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH, get_current_user, new_friend_code
from app.core.rate_limit import FRIEND_LOOKUP_LIMIT, FRIEND_REQUEST_LIMIT, limiter
from app.db import get_db
from app.models.models import Block, Device, FriendRequest, User
from app.schemas.accounts import MeOut
from app.schemas.friends import (
    BlockIn,
    DeviceIn,
    FriendOut,
    FriendRequestIn,
    FriendRequestOut,
    PersonOut,
    PublicProfile,
)
from app.services import friends as social
from app.services.push import Push, queue_push
from app.services.stats import travel_stats

router = APIRouter(tags=["friends"])

NOT_FOUND = HTTPException(status_code=404, detail="Not found")
SEARCH_LIMIT = 20


def _public(user: User) -> PublicProfile:
    return PublicProfile(id=user.id, username=user.username or "", display_name=user.display_name)


def _person(db: Session, viewer: User, other: User) -> PersonOut:
    rel, request_id = social.relation(db, viewer, other)
    return PersonOut(**_public(other).model_dump(), relation=rel, request_id=request_id)


def _request_out(db: Session, req: FriendRequest, viewer: User) -> FriendRequestOut:
    outgoing = req.from_user_id == viewer.id
    other = db.get(User, req.to_user_id if outgoing else req.from_user_id)
    return FriendRequestOut(
        id=req.id, status=req.status, direction="out" if outgoing else "in", created_at=req.created_at, user=_public(other)
    )


def _name(user: User) -> str:
    return user.display_name or f"@{user.username}"


def _normalize_code(code: str) -> str | None:
    c = code.strip().upper()
    if len(c) != FRIEND_CODE_LENGTH or any(ch not in FRIEND_CODE_ALPHABET for ch in c):
        return None
    return c


def _visible_by_code(db: Session, viewer: User, code: str) -> User:
    """The user behind a friend code, unless the code is unknown or either blocked the other."""
    normalized = _normalize_code(code)
    target = db.scalar(select(User).where(User.friend_code == normalized)) if normalized else None
    if target is None or not target.username or social.blocked_either_way(db, viewer.id, target.id):
        raise NOT_FOUND
    return target


# ---------------------------------------------------------------------------
# Finding people
# ---------------------------------------------------------------------------

@router.get("/users/search", response_model=List[PersonOut])
@limiter.limit(FRIEND_LOOKUP_LIMIT)
def search_users(
    request: Request,  # required by the rate limiter
    q: str = Query("", max_length=40),
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Username prefix search over people who allow it, without anyone blocked either way."""
    prefix = q.strip().lstrip("@").lower()
    if len(prefix) < 2:
        return []
    blocked = select(Block.blocked_id).where(Block.blocker_id == viewer.id)
    blockers = select(Block.blocker_id).where(Block.blocked_id == viewer.id)
    escaped = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    users = db.scalars(
        select(User)
        .where(
            User.username.like(f"{escaped}%", escape="\\"),
            User.discoverable.is_(True),
            User.id != viewer.id,
            User.id.not_in(blocked),
            User.id.not_in(blockers),
        )
        .order_by(User.username)
        .limit(SEARCH_LIMIT)
    ).all()
    return [_person(db, viewer, u) for u in users]


@router.get("/friend-codes/{code}", response_model=PersonOut)
@limiter.limit(FRIEND_LOOKUP_LIMIT)
def lookup_friend_code(request: Request, code: str, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """The profile behind a QR code or invite link (works even if they're not discoverable)."""
    return _person(db, viewer, _visible_by_code(db, viewer, code))


@router.post("/me/friend-code/rotate", response_model=MeOut)
def rotate_friend_code(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """A new code; the old QR codes and links stop working."""
    for _ in range(5):
        user.friend_code = new_friend_code()
        try:
            db.commit()
            break
        except IntegrityError:  # astronomically unlikely collision
            db.rollback()
    else:
        raise HTTPException(status_code=503, detail="Try again")
    db.refresh(user)
    return _me_out(user)


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

@router.post("/friend-requests", response_model=FriendRequestOut)
@limiter.limit(FRIEND_REQUEST_LIMIT)
def send_friend_request(
    request: Request,
    payload: FriendRequestIn,
    background: BackgroundTasks,
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Ask someone to be friends. If they already asked you, this accepts their request.
    By user id only for discoverable people (search); a friend code works for anyone.
    """
    if payload.friend_code is not None:
        target = _visible_by_code(db, viewer, payload.friend_code)
    else:
        target = db.get(User, payload.user_id)
        if (
            target is None
            or not target.username
            or social.blocked_either_way(db, viewer.id, target.id)
            or not (target.discoverable or social.pending_request(db, target.id, viewer.id))
        ):
            raise NOT_FOUND
    if target.id == viewer.id:
        raise HTTPException(status_code=400, detail="That's your own code")
    if social.friendship(db, viewer.id, target.id):
        raise HTTPException(status_code=409, detail="You're already friends")

    incoming = social.pending_request(db, target.id, viewer.id)
    if incoming is not None:
        return _accept(db, incoming, viewer, background)

    existing = social.pending_request(db, viewer.id, target.id)
    if existing is not None:
        return _request_out(db, existing, viewer)

    req = FriendRequest(from_user_id=viewer.id, to_user_id=target.id)
    db.add(req)
    try:
        db.commit()
    except IntegrityError:  # the same request sent twice at once
        db.rollback()
        req = social.pending_request(db, viewer.id, target.id)
        return _request_out(db, req, viewer)
    db.refresh(req)
    queue_push(background, db, target.id, Push(
        title="New friend request", body=f"{_name(viewer)} wants to be friends on Vromon",
        url="/friends", preference="notify_friend_requests",
    ))
    return _request_out(db, req, viewer)


@router.get("/friend-requests", response_model=List[FriendRequestOut])
def list_friend_requests(
    direction: Literal["in", "out"] = "in",
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Pending requests to you (`in`) or from you (`out`), newest first."""
    column = FriendRequest.to_user_id if direction == "in" else FriendRequest.from_user_id
    rows = db.scalars(
        select(FriendRequest).where(column == viewer.id, FriendRequest.status == "pending").order_by(FriendRequest.created_at.desc())
    ).all()
    return [_request_out(db, r, viewer) for r in rows]


def _pending_for(db: Session, request_id: int, viewer: User, side: Literal["to", "from"]) -> FriendRequest:
    req = db.get(FriendRequest, request_id)
    owner_id = None if req is None else (req.to_user_id if side == "to" else req.from_user_id)
    if req is None or req.status != "pending" or owner_id != viewer.id:
        raise NOT_FOUND
    return req


def _accept(db: Session, req: FriendRequest, viewer: User, background: BackgroundTasks) -> FriendRequestOut:
    if social.blocked_either_way(db, req.from_user_id, req.to_user_id):
        raise NOT_FOUND
    social.befriend(db, req.from_user_id, req.to_user_id)
    req.status = "accepted"
    req.responded_at = datetime.utcnow()
    db.commit()
    queue_push(background, db, req.from_user_id, Push(
        title="Friend request accepted", body=f"{_name(viewer)} accepted your friend request",
        url=f"/friends/{viewer.id}", preference="notify_friend_accepted",
    ))
    return _request_out(db, req, viewer)


@router.post("/friend-requests/{request_id}/accept", response_model=FriendRequestOut)
def accept_friend_request(request_id: int, background: BackgroundTasks, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _accept(db, _pending_for(db, request_id, viewer, "to"), viewer, background)


@router.post("/friend-requests/{request_id}/decline", response_model=FriendRequestOut)
def decline_friend_request(request_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = _pending_for(db, request_id, viewer, "to")
    req.status, req.responded_at = "declined", datetime.utcnow()
    db.commit()
    return _request_out(db, req, viewer)


@router.post("/friend-requests/{request_id}/cancel", response_model=FriendRequestOut)
def cancel_friend_request(request_id: int, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = _pending_for(db, request_id, viewer, "from")
    req.status, req.responded_at = "cancelled", datetime.utcnow()
    db.commit()
    return _request_out(db, req, viewer)


# ---------------------------------------------------------------------------
# Friends and blocks
# ---------------------------------------------------------------------------

@router.get("/friends", response_model=List[FriendOut])
def list_friends(viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    out = []
    for friend_id, since in social.friend_ids(db, viewer.id):
        friend = db.get(User, friend_id)
        stats = travel_stats(db, friend_id)
        out.append(FriendOut(**_public(friend).model_dump(), since=since, countries=stats.countries, world_percent=stats.world_percent))
    return sorted(out, key=lambda f: (f.display_name or f.username).lower())


@router.delete("/friends/{user_id}", status_code=204)
def remove_friend(user_id: uuid.UUID, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Unfriend: access to each other's data ends immediately."""
    if not social.unfriend(db, viewer.id, user_id):
        raise NOT_FOUND
    db.commit()
    return Response(status_code=204)


@router.get("/blocks", response_model=List[PublicProfile])
def list_blocks(viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    users = db.scalars(
        select(User).join(Block, Block.blocked_id == User.id).where(Block.blocker_id == viewer.id).order_by(User.username)
    ).all()
    return [_public(u) for u in users]


@router.post("/blocks", status_code=204)
def block_user(payload: BlockIn, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Block: ends the friendship, cancels pending requests, hides you from each other."""
    target = db.get(User, payload.user_id)
    if target is None or target.id == viewer.id:
        raise NOT_FOUND
    if db.get(Block, (viewer.id, target.id)) is None:
        db.add(Block(blocker_id=viewer.id, blocked_id=target.id))
    social.unfriend(db, viewer.id, target.id)
    social.cancel_pending_between(db, viewer.id, target.id)
    db.commit()
    return Response(status_code=204)


@router.delete("/blocks/{user_id}", status_code=204)
def unblock_user(user_id: uuid.UUID, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.execute(delete(Block).where(Block.blocker_id == viewer.id, Block.blocked_id == user_id)).rowcount == 0:
        raise NOT_FOUND
    db.commit()
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Push tokens
# ---------------------------------------------------------------------------

@router.post("/me/devices", status_code=204)
def register_device(payload: DeviceIn, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Register this install's Expo push token. A token moves with whoever signed in last."""
    device = db.scalar(select(Device).where(Device.expo_push_token == payload.expo_push_token))
    if device is None:
        db.add(Device(user_id=viewer.id, expo_push_token=payload.expo_push_token, platform=payload.platform))
    else:
        device.user_id, device.platform, device.last_seen_at = viewer.id, payload.platform, datetime.utcnow()
    db.commit()
    return Response(status_code=204)


@router.delete("/me/devices/{token}", status_code=204)
def unregister_device(token: str, viewer: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Called on sign-out, so the next person on this phone doesn't get your notifications."""
    db.execute(delete(Device).where(Device.expo_push_token == token, Device.user_id == viewer.id))
    db.commit()
    return Response(status_code=204)
