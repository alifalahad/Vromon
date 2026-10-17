"""
Vromon — Intelligent Adaptive Travel Itinerary Planning System
FastAPI application entry point (v2).
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.logging import setup_logging
from app.core.monitoring import setup_monitoring
from app.db.base import engine, SessionLocal
from app.db.migrations import upgrade_to_head
from app.db.seeder import seed_database
from app.db.geo_seed import seed_geo
from app.api.v1.router import router as v1_router

# Configure logging
setup_logging(debug=settings.app_debug)
logger = logging.getLogger("vromon")
# Before the app is created, so FastAPI is instrumented (no-op without SENTRY_DSN)
setup_monitoring()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info(f"Vromon backend starting (env={settings.app_env})")
    logger.info(f"Database: {'SQLite' if settings.is_sqlite else 'PostgreSQL'}")

    # Apply schema migrations (Alembic). create_all is no longer used: it never
    # alters existing tables.
    upgrade_to_head(engine)
    logger.info("Database schema is at the latest migration.")

    # Seed demo data and the geography reference tables
    db = SessionLocal()
    try:
        seed_database(db)
        seed_geo(db)
    finally:
        db.close()

    # RAG ingestion (idempotent — skips unchanged chunks)
    db = SessionLocal()
    try:
        from app.services.rag.ingestion import ingest_all_seed_files
        rag_results = ingest_all_seed_files(db)
        for r in rag_results:
            logger.info(f"RAG: {r}")
    except Exception as exc:
        logger.warning(f"RAG ingestion failed at startup (non-fatal): {exc}")
    finally:
        db.close()

    logger.info("Vromon backend ready.")
    yield

    # Shutdown
    logger.info("Vromon backend shutting down.")


app = FastAPI(
    title="Vromon API",
    description=(
        "Intelligent Adaptive Travel Itinerary Planning and Recommendation System. "
        "Uses RAG and Constraint Optimization for personalized travel planning."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# CORS
# Browser origins come from CORS_ORIGINS. Native mobile apps are not subject to CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "X-Admin-Token"],
)

# Mount API v1
# Rate limits (slowapi): 429 when exceeded
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(v1_router)


# ---------------------------------------------------------------------------
# Root and health endpoints
# ---------------------------------------------------------------------------

@app.get("/", tags=["system"])
def root():
    """Application information."""
    return {
        "app": "Vromon",
        "version": "2.0.0",
        "status": "running",
        "api_docs": "/docs",
        "api_prefix": "/api/v1",
    }


@app.get("/health", tags=["system"])
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "version": "2.0.0",
        "database": "sqlite" if settings.is_sqlite else "postgresql",
        "llm_configured": settings.has_llm,
        "embeddings_configured": settings.has_embeddings,
    }


# ---------------------------------------------------------------------------
# Global exception handler
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return safe error response."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal error occurred. Please try again later."},
    )
