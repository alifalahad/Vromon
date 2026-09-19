"""
Vromon — Intelligent Adaptive Travel Itinerary Planning System
FastAPI application entry point.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database.database import Base, engine
from app.database.seeder import seed_database
from app.database.database import SessionLocal
from app.api import destinations, places, trips

# Create all tables
Base.metadata.create_all(bind=engine)

# Seed demo data on startup
db = SessionLocal()
try:
    seed_database(db)
finally:
    db.close()

app = FastAPI(
    title="Vromon API",
    description="Intelligent Adaptive Travel Itinerary Planning System — Demo",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(destinations.router)
app.include_router(places.router)
app.include_router(trips.router)


@app.get("/")
def root():
    return {
        "app": "Vromon",
        "version": "1.0.0",
        "status": "running",
        "demo_destination": "Cox's Bazar, Bangladesh",
        "docs": "/docs",
    }


@app.get("/api/health")
def health():
    return {"status": "healthy"}
