"""
Vromon Backend — friend schemas.

What a non-friend may see (decision D3): username, display name, avatar. Nothing else.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

Relation = Literal["self", "none", "requested", "incoming", "friends"]


class PublicProfile(BaseModel):
    id: uuid.UUID
    username: str
    display_name: Optional[str] = None
    # Profile photos arrive in Phase 6
    avatar_url: Optional[str] = None


class PersonOut(PublicProfile):
    """A search result or friend-code preview, with the button state for the viewer."""
    relation: Relation
    # The pending request, when relation is "requested" or "incoming"
    request_id: Optional[int] = None


class FriendRequestIn(BaseModel):
    """Exactly one of: a user id (from search) or a friend code (QR, link, typed)."""
    user_id: Optional[uuid.UUID] = None
    friend_code: Optional[str] = Field(None, max_length=32)

    @model_validator(mode="after")
    def _one_target(self) -> "FriendRequestIn":
        if (self.user_id is None) == (self.friend_code is None):
            raise ValueError("Send either user_id or friend_code")
        return self


class FriendRequestOut(BaseModel):
    id: int
    status: Literal["pending", "accepted", "declined", "cancelled"]
    direction: Literal["in", "out"]
    created_at: datetime
    # The other person
    user: PublicProfile


class FriendOut(PublicProfile):
    since: datetime
    countries: int
    world_percent: float


class FriendProfileOut(PublicProfile):
    """GET /users/{id}/profile: the owner, or a friend."""
    is_self: bool
    friends_since: Optional[datetime] = None
    home_country_iso2: Optional[str] = None


class BlockIn(BaseModel):
    user_id: uuid.UUID


class DeviceIn(BaseModel):
    expo_push_token: str = Field(pattern=r"^Expo(nent)?PushToken\[[^\]]{1,200}\]$")
    platform: Literal["android", "ios", "web"]


class ComparePlace(BaseModel):
    code: str
    name: str
    country_iso2: Optional[str] = None


class CompareView(BaseModel):
    in_common: List[ComparePlace]
    only_me: List[ComparePlace]
    only_them: List[ComparePlace]


class CompareOut(BaseModel):
    """Visited places (visited or lived) of the viewer and another user, per map view."""
    countries: CompareView
    regions: CompareView
    cities: CompareView
