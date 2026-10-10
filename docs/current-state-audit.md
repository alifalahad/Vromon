# Vromon — Current State Audit

**Date:** 2026-10-10
**Auditor:** Automated system audit

---

## Repository Overview

| Property | Value |
|---|---|
| Repository | `alifalahad/Vromon` |
| Python Version | 3.14.6 |
| Node.js Version | v24.18.0 |
| npm Version | 11.16.0 |
| Git Commits | 8 (initial commit through demo app) |

---

## Directory State

| Directory | Status | Contents |
|---|---|---|
| `demo/` | ✅ Complete demo app | Backend (FastAPI/SQLite) + Frontend (React/Vite/TS) |
| `backend/` | ❌ Empty | Target for new backend |
| `mobile/` | ❌ Empty | Target for new React Native app |
| `data/` | ❌ Empty | Target for seed data and sources |
| `docs/` | ❌ Empty (now being populated) | Target for documentation |
| `evaluation/` | ❌ Empty | Target for evaluation scripts |

---

## Git Status

The repository was restructured: old root-level files (backend/, frontend/, README, etc.) were deleted and moved to `demo/`. The `demo/` directory is untracked (`??`). All old root files show `D` (deleted) status.

**Important:** The restructure has not yet been committed — the old files are marked as deleted and `demo/` is untracked.

---

## Demo Application Analysis

### Backend (demo/backend/)

| Component | Status | Details |
|---|---|---|
| **Framework** | FastAPI 0.115+ | Synchronous endpoints |
| **Database** | SQLite via SQLAlchemy 2.x | Auto-created `vromon.db` |
| **ORM Models** | 9 models | Place, Restaurant, Hotel, Trip, TripPreference, TripConstraint, Itinerary, ItineraryItem, Feedback |
| **Schemas** | Pydantic v2 | Full request/response schemas |
| **Seed Data** | `coxsbazar.json` | 25 places, 10 restaurants, 8 hotels |
| **Recommendation Engine** | Weighted scoring v1 | 7-factor scoring with configurable weights |
| **Itinerary Generator** | Heuristic greedy scheduler | Time-aware, meal-inserting, travel-time calculation |
| **Adaptation Service** | Rule-based | relax, reduce_budget, avoid_crowds, energise |
| **RAG Service** | Placeholder only | Returns mock context |
| **Optimization Service** | Placeholder only | Identity pass-through |
| **Tests** | 13 passing | Recommendation scoring, utilities, itinerary generation |
| **Config** | Pydantic Settings | `.env` file based |

### Frontend (demo/frontend/)

| Component | Status | Details |
|---|---|---|
| **Framework** | React 18 + TypeScript + Vite | Web application (NOT mobile) |
| **Styling** | Tailwind CSS v4 | Web-only styling |
| **Maps** | Leaflet + OpenStreetMap | No API key needed |
| **Pages** | 4 | Landing, PlanTrip, Itinerary, SavedTrips |
| **Components** | Budget dashboard, Feedback panel, Activity card, Day view, Trip map | Full featured |
| **API Client** | Axios | `services/api.ts` |
| **PWA** | Enabled | Service worker + manifest for Android install |

### API Endpoints (demo)

| Method | Endpoint | Implemented |
|---|---|---|
| GET | `/` | ✅ Root info |
| GET | `/api/health` | ✅ Health check |
| GET | `/api/destinations` | ✅ List destinations |
| GET | `/api/destinations/{dest}/places` | ✅ Places by destination |
| GET | `/api/destinations/{dest}/restaurants` | ✅ Restaurants by destination |
| GET | `/api/destinations/{dest}/hotels` | ✅ Hotels by destination |
| GET | `/api/places` | ✅ All places (filterable) |
| GET | `/api/places/{id}` | ✅ Place detail |
| POST | `/api/places/recommendations` | ✅ Scored recommendations |
| POST | `/api/trips` | ✅ Create trip |
| GET | `/api/trips` | ✅ List trips |
| GET | `/api/trips/{id}` | ✅ Trip detail |
| PUT | `/api/trips/{id}` | ✅ Update trip |
| DELETE | `/api/trips/{id}` | ✅ Delete trip |
| POST | `/api/trips/{id}/duplicate` | ✅ Duplicate trip |
| POST | `/api/trips/{id}/generate` | ✅ Generate itinerary |
| POST | `/api/trips/{id}/regenerate` | ✅ Regenerate itinerary |
| GET | `/api/trips/{id}/itinerary` | ✅ Get itinerary |
| POST | `/api/trips/{id}/days/{dayId}/regenerate` | ✅ Regenerate one day |
| DELETE | `/api/trips/{id}/items/{itemId}` | ✅ Remove activity |
| POST | `/api/trips/{id}/adapt` | ✅ Adapt itinerary |
| POST | `/api/trips/{id}/feedback` | ✅ Submit feedback |
| GET | `/api/trips/{id}/feedback` | ✅ Get feedback |

---

## What Needs to Be Built (New Application)

### Backend (`backend/`)
1. FastAPI application with PostgreSQL (not SQLite)
2. SQLAlchemy 2.x with Alembic migrations
3. pgvector for embedding storage
4. PostGIS for geographic queries
5. Real RAG pipeline (ingestion → chunking → embedding → retrieval → generation)
6. Real recommendation ranking with deterministic scoring
7. Constraint optimization with OR-Tools CP-SAT
8. Independent constraint validator
9. Versioned API (`/api/v1/...`)
10. Proper configuration management
11. Comprehensive test suite

### Mobile (`mobile/`)
1. React Native + Expo + TypeScript (NOT a web app)
2. File-based navigation with Expo Router
3. TanStack Query for server state
4. Multi-step trip-planning wizard with React Hook Form + Zod
5. Itinerary display with day navigation
6. Map integration with react-native-maps
7. Saved trips management

### Data (`data/`)
1. Cox's Bazar seed data (from demo)
2. Additional source documents for RAG
3. Data import/validation scripts

### Evaluation (`evaluation/`)
1. Retrieval quality metrics
2. Recommendation quality metrics
3. Optimization quality metrics
4. System performance metrics

---

## Key Decisions Required

1. **LLM Provider:** Google Gemini recommended (free tier available for students)
2. **Embedding Model:** Compatible with Bangla + English text
3. **PostgreSQL Hosting:** Local dev + Neon/Supabase for hosted
4. **Maps Provider:** react-native-maps with Google Maps or MapLibre
