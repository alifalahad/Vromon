"""
Vromon API v1 — Main router.

Aggregates all v1 endpoint routers under /api/v1 prefix.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import destinations, places, trips

router = APIRouter(prefix="/api/v1")

router.include_router(destinations.router)
router.include_router(places.router)
router.include_router(trips.router)
