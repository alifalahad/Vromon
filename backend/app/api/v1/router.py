"""
Vromon API v1 — Main router.

Aggregates all v1 endpoint routers under /api/v1 prefix.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import chat, destinations, friends, geo, live, me, photos, places, rag, rooms, trips, users, visits

router = APIRouter(prefix="/api/v1")

router.include_router(destinations.router)
router.include_router(places.router)
router.include_router(trips.router)
router.include_router(rag.router)
router.include_router(me.router)
# Before users: /users/search must not be read as /users/{user_id}
router.include_router(friends.router)
router.include_router(users.router)
router.include_router(chat.router)
router.include_router(rooms.router)
router.include_router(live.router)
router.include_router(photos.router)
router.include_router(geo.router)
router.include_router(visits.router)
