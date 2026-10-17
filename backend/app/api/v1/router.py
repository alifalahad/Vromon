"""
Vromon API v1 — Main router.

Aggregates all v1 endpoint routers under /api/v1 prefix.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import destinations, friends, geo, me, photos, places, rag, trips, users, visits

router = APIRouter(prefix="/api/v1")

router.include_router(destinations.router)
router.include_router(places.router)
router.include_router(trips.router)
router.include_router(rag.router)
router.include_router(me.router)
# Before users: /users/search must not be read as /users/{user_id}
router.include_router(friends.router)
router.include_router(users.router)
router.include_router(photos.router)
router.include_router(geo.router)
router.include_router(visits.router)
