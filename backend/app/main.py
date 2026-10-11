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

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.base import Base, engine, SessionLocal
from app.db.seeder import seed_database
from app.api.v1.router import router as v1_router

# Configure logging
setup_logging(debug=settings.app_debug)
logger = logging.getLogger("vromon")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Startup
    logger.info(f"Vromon backend starting (env={settings.app_env})")
    logger.info(f"Database: {'SQLite' if settings.is_sqlite else 'PostgreSQL'}")

    # Create tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified.")

    # Seed demo data
    db = SessionLocal()
    try:
        seed_database(db)
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
