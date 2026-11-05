"""
Vromon Backend — friend schemas.

What a non-friend may see (decision D3): username, display name, avatar. Nothing else.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

Relation = Literal["self", "none", "requested", "incoming", "friends"]


class PublicProfile(BaseModel):
    id: uuid.UUID
    username: str
    display_name: Optional[str] = None
    # Profile photo (ImgBB), when the person added one
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


class RoadTripOut(BaseModel):
    """A friend's trip today, or their next one within 14 days (step 6)."""
    trip_id: int
    destination: str
    start_date: date
    end_date: date
    # Day N of `days` while it's on; null before it starts
    day: Optional[int] = None
    days: int
    # Days until it starts; 0 once it has
    starts_in: int


class OnTheRoadOut(BaseModel):
    """GET /me/friends/on-the-road: one friend and their trip."""
    friend: PublicProfile
    trip: RoadTripOut


class FriendProfileOut(PublicProfile):
    """GET /users/{id}/profile: the owner, or a friend."""
    is_self: bool
    friends_since: Optional[datetime] = None
    home_country_iso2: Optional[str] = None
    # False when they hide their trips from friends (their trip list is then empty too)
    shares_trips: bool = True


class BlockIn(BaseModel):
    user_id: uuid.UUID


EXPO_PUSH_TOKEN = r"^Expo(nent)?PushToken\[[^\]]{1,200}\]$"


class DeviceIn(BaseModel):
    expo_push_token: str = Field(pattern=EXPO_PUSH_TOKEN)
    platform: Literal["android", "ios", "web"]


class DeviceTokenIn(BaseModel):
    """A push token goes in the body, never the URL: URLs end up in logs, and the token can send to that phone."""
    expo_push_token: str = Field(pattern=EXPO_PUSH_TOKEN)


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


class FootprintOut(BaseModel):
    """A place friends have visited (or lived in), and who: the friends layer on the travel map."""
    place_type: Literal["country", "region", "city"]
    place_code: str
    count: int
    # When the newest of these friends marked it
    latest_at: datetime
    # Newest first
    friends: List[PublicProfile]
