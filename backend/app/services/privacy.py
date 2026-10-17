"""
Vromon Backend — who may see whose data (prompt §6.3, enforced on the server).

Every `/users/{user_id}/…` route depends on `require_viewer_can_see`. A viewer who
may not see the user gets 404, never 403, so the response doesn't confirm that
the account exists.

Visible to: the owner and accepted friends (read-only; every route under
`/users/{id}` is a GET). Strangers, blocked users and ex-friends get 404.
"""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.db import get_db
from app.models.models import User
from app.services.friends import blocked_either_way, friendship

NOT_FOUND = "Not found"


def viewer_can_see(db: Session, viewer: User, owner: User) -> bool:
    if viewer.id == owner.id:
        return True
    # Blocking removes the friendship; the block check is a second line of defence
    return friendship(db, viewer.id, owner.id) is not None and not blocked_either_way(db, viewer.id, owner.id)


def require_viewer_can_see(
    user_id: uuid.UUID,
    viewer: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """The user named in the path, if the viewer may see their data; otherwise 404."""
    owner = db.get(User, user_id)
    if owner is None or not viewer_can_see(db, viewer, owner):
        raise HTTPException(status_code=404, detail=NOT_FOUND)
    return owner
