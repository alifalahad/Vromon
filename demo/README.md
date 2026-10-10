# Vromon — Intelligent Adaptive Travel Itinerary Planning System

> **Research Demo** · Cox's Bazar, Bangladesh · Rule-based Recommendation + Heuristic Scheduling

---

## Overview

Vromon is a complete demo application for an intelligent travel itinerary planning system. It takes user preferences (destination, budget, interests, travel style, constraints) and generates a personalized, budget-aware, time-respecting multi-day itinerary with transparent recommendation reasoning.

This is **Version 1** — a foundation for a larger research system that will incorporate RAG, constraint optimization, and adaptive machine learning.

---

## Features

| Feature | Status |
|---------|--------|
| 6-step trip creation wizard | ✅ |
| Weighted-score recommendation engine | ✅ |
| Heuristic day-by-day itinerary generation | ✅ |
| Schedule: opening hours, travel time, meal breaks | ✅ |
| Interactive map (Leaflet + OpenStreetMap) | ✅ |
| Budget dashboard with real-time breakdown | ✅ |
| Transparent "Why we recommend" explanations | ✅ |
| Itinerary editing (remove, regenerate day) | ✅ |
| Adaptive re-planning (relax / reduce cost / avoid crowds) | ✅ |
| User feedback panel (star rating + tags) | ✅ |
| Saved trips dashboard | ✅ |
| Full REST API (FastAPI + Swagger docs) | ✅ |
| SQLite DB (switchable to PostgreSQL) | ✅ |
| 25 attractions, 10 restaurants, 8 hotels (demo data) | ✅ |
| 13 automated tests | ✅ |
| Responsive design (desktop + mobile) | ✅ |

---

## Architecture

```
Vromon/
├── backend/                 # FastAPI + Python
│   ├── app/
│   │   ├── api/             # REST routers
│   │   │   ├── destinations.py
│   │   │   ├── places.py
│   │   │   └── trips.py
│   │   ├── models/          # SQLAlchemy ORM
│   │   ├── schemas/         # Pydantic schemas
│   │   ├── services/
│   │   │   ├── recommendation/  # Weighted scoring engine
│   │   │   ├── itinerary/       # Heuristic scheduler
│   │   │   ├── optimization/    # Placeholder (future: OR-Tools)
│   │   │   ├── rag/             # Placeholder (future: ChromaDB + LLM)
│   │   │   └── adaptation/      # Rule-based adaptation
│   │   ├── database/        # SQLAlchemy engine + seeder
│   │   └── main.py          # App entry point
│   ├── data/
│   │   └── coxsbazar.json   # Demo seed data
│   └── tests/               # pytest test suite
│
├── frontend/                # React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── pages/           # Landing, PlanTrip, Itinerary, SavedTrips
│       ├── components/
│       │   ├── layout/      # Navbar
│       │   ├── Itinerary/   # DayView, ActivityCard
│       │   ├── Map/         # TripMap (Leaflet)
│       │   ├── Budget/      # BudgetDashboard
│       │   └── Feedback/    # FeedbackPanel
│       ├── services/        # Axios API client
│       └── types/           # TypeScript interfaces
│
├── .env.example
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Python 3.11, FastAPI, Pydantic v2 |
| Database | SQLite (dev) / PostgreSQL (prod) via SQLAlchemy |
| Maps | Leaflet + OpenStreetMap (no API key needed) |
| Icons | Lucide React |

---

## Installation & Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+

### Backend

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate          # macOS/Linux
# venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp ../.env.example .env

# Start the server (DB is auto-created and seeded)
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend

# Install dependencies
npm install --legacy-peer-deps

# Start dev server
npm run dev
```

App: http://localhost:5173

---

## Environment Variables

Copy `.env.example` to `backend/.env`:

```env
DATABASE_URL=sqlite:///./vromon.db          # or PostgreSQL URL
SECRET_KEY=vromon-demo-secret-key
DEBUG=true
CORS_ORIGINS=http://localhost:5173
LLM_API_KEY=                               # Optional — not used in v1
MAP_API_KEY=                               # Not required (uses OSM)
```

---

## Database Setup

SQLite is used by default — **no setup needed**. The database is created automatically on first run and seeded with Cox's Bazar demo data.

For PostgreSQL:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/vromon
```

---

## Demo Instructions

### Quick Demo Flow

1. Open http://localhost:5173
2. Click **Plan My Trip**
3. Dates: any 3-day range
4. Budget: ৳15,000
5. Interests: Beach, Nature, Food, Photography
6. Style: Relaxed | Activity: Medium
7. Max activities/day: 4 | Avoid crowded: toggle on
8. Click **Generate My Itinerary**
9. View day-by-day timeline with recommendation reasons
10. Click **Regenerate Day** on any day
11. Click **Adapt** → "Make it more relaxed"
12. View the budget dashboard (right panel)
13. Click a star rating and submit feedback
14. Click **Save Trip**
15. Navigate to **My Trips** to see saved trip

---

## API Documentation

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/destinations | List destinations |
| GET | /api/destinations/{dest}/places | Places in destination |
| GET | /api/destinations/{dest}/hotels | Hotels |
| GET | /api/places | All places (filterable) |
| POST | /api/places/recommendations | Get scored recommendations |
| POST | /api/trips | Create a trip |
| GET | /api/trips | List all trips |
| GET | /api/trips/{id} | Get trip detail |
| PUT | /api/trips/{id} | Update trip |
| DELETE | /api/trips/{id} | Delete trip |
| POST | /api/trips/{id}/generate | Generate itinerary |
| POST | /api/trips/{id}/regenerate | Regenerate itinerary |
| GET | /api/trips/{id}/itinerary | Get itinerary |
| POST | /api/trips/{id}/days/{dayId}/regenerate | Regenerate one day |
| DELETE | /api/trips/{id}/items/{itemId} | Remove activity |
| POST | /api/trips/{id}/adapt | Adapt itinerary |
| POST | /api/trips/{id}/feedback | Submit feedback |

Full Swagger UI: http://localhost:8000/docs

---

## Running Tests

```bash
cd backend
source venv/bin/activate
python -m pytest tests/ -v
```

Tests cover:
- Interest matching raises recommendation scores
- Excluded places never appear in results
- Must-visit places always included
- Crowd penalty applied correctly
- All scores clamped to [0, 1]
- Reasons always provided
- Haversine distance calculation
- Time utilities
- No overlapping activities in generated schedule
- Max activities per day respected
- Correct number of days generated

---

## Future AI/RAG Integration

**Where:** `backend/app/services/rag/rag_service.py`

**Interface:**
```python
class RAGService:
    def retrieve_context(self, query: str) -> dict: ...
    def generate_grounded_explanation(self, query, context) -> str: ...
```

**Plan:** Replace mock returns with ChromaDB/Pinecone vector retrieval + LLM (OpenAI / local Llama) generation. The frontend and API contracts require zero changes.

---

## Future Constraint Optimization

**Where:** `backend/app/services/optimization/optimization_service.py`

**Interface:**
```python
class OptimizationService:
    def optimize_itinerary(self, candidates, preferences, constraints) -> list: ...
```

**Plan:** Replace the greedy heuristic in `ItineraryService._build_day()` with OR-Tools CP-SAT or MILP solver. `ItineraryService` will call `OptimizationService.optimize_itinerary()` instead of its internal greedy loop.

---

## Future Adaptive Learning

**Where:** `backend/app/services/adaptation/adaptation_service.py`

**Interface:**
```python
class AdaptationService:
    def adapt_trip(self, db, trip, adaptation_type, parameters) -> list: ...
```

**Plan:** Replace rule-based strategies with preference-vector learning. User feedback (stored in `Feedback` table) updates a user preference model. Bandit algorithms or RL policy can then personalize future recommendations.

---

## Research Direction

This system is designed to support comparative evaluation of:

| Configuration | Description |
|--------------|-------------|
| Baseline | Random activity selection |
| Personalized | Weighted-score recommendation (current) |
| Constraint-aware | + Opening hours, budget, travel time (current) |
| Optimized | + OR-Tools constraint solver |
| RAG + Optimized | + Vector retrieval grounded recommendations |
| Adaptive | + Feedback-learning preference updates |

Intermediate outputs (candidate places, recommendation scores, constraint violations, final schedule) are exposed via API to support research experiments.

---

## Demo Credentials

No authentication required in v1. All data is shared.

---

*Vromon — Demo v1.0.0 · Research Project · Cox's Bazar, Bangladesh*
