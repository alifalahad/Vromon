# Vromon

**Intelligent Adaptive Travel Itinerary Planning and Recommendation System Using RAG and Constraint Optimization**

Vromon plans multi-day trips. It ranks places with an explainable scoring model and builds
day-by-day itineraries with either a fast greedy scheduler or an OR-Tools CP-SAT optimizer.
An independent constraint validator checks every itinerary and every edit. Explanations are
grounded in retrieved source records (RAG with Google Gemini), and every claim cites them.

| Part | Stack | Folder |
|---|---|---|
| Backend API | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, OR-Tools CP-SAT, google-genai | [`backend/`](backend/README.md) |
| Mobile app | Expo SDK 57, React Native 0.86, TypeScript, Expo Router, TanStack Query, React Hook Form + Zod, react-native-maps | [`mobile/`](mobile/) |
| Data | Cox's Bazar sample dataset (25 places, 10 restaurants, 8 hotels) | [`data/seed/`](data/seed/) |
| Evaluation | Reproducible scripts and recorded results | [`evaluation/`](evaluation/README.md) |
| Docs | Architecture, decisions, feature inventory, phase reports | [`docs/`](docs/) |
| Original demo | Preserved and unchanged (web app + PWA) | [`demo/`](demo/) |

## Quick start

You need Python 3.11, Node.js 22.13+ or 24+, and optionally Docker.

### 1. Backend
```bash
cd backend
python3.11 -m venv venv
venv/bin/pip install -r requirements.lock && venv/bin/pip install -e . --no-deps
cp ../.env.example .env                  # optional: add Gemini keys for AI features
venv/bin/python -m pytest -q             # offline test suite
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
Open http://localhost:8000/docs. On first start, sample data is seeded automatically (SQLite file `backend/vromon.db`).

**Or with Docker (PostgreSQL 16):** from the repo root, run `docker compose up --build`. The API is on http://localhost:8000.

### 2. Mobile app
```bash
cd mobile
npm ci
cp .env.example .env                     # set EXPO_PUBLIC_API_URL (your computer's LAN IP for a phone)
npm run typecheck && npm run lint && npm test
npm run android                          # builds and installs the development build on a USB phone/emulator
npx expo start                           # afterwards: start Metro for the installed dev build; press w for web
```

The app uses native modules that Expo Go doesn't include (haptics, Reanimated, bottom sheets, and from Phase 3 MapLibre), so it runs as a **development build**, not in Expo Go. `npm run android` (`expo run:android`) generates `android/` from `app.config.ts` and needs the Android SDK and JDK 17–25 (`JAVA_HOME`). Never edit `android/` by hand. Cloud builds use `eas.json` (`npx eas-cli@latest build --profile development|preview|production`).

**Which `EXPO_PUBLIC_API_URL`?** `localhost` on a phone or emulator means the device itself, not your computer.

| Where the app runs | `EXPO_PUBLIC_API_URL` |
|---|---|
| Web preview (`w`) or iOS Simulator on the same Mac | `http://127.0.0.1:8000` |
| Android Emulator | `http://10.0.2.2:8000` (the emulator's alias for your computer) |
| Physical phone on the same Wi-Fi (development build) | `http://<your computer's LAN IP>:8000`, e.g. from `ipconfig getifaddr en0` on macOS |

For a phone, start the backend with `--host 0.0.0.0` and allow incoming connections if the firewall asks. Restart `npx expo start` after changing `.env`. Only the public API URL belongs in this file; LLM keys stay in `backend/.env`.

## What it does

1. **Plan:** a 6-step wizard collects destination, dates, budget (presets or a daily cap), interests, pace, daily hours, and must-visit/excluded places.
2. **Rank:** a weighted, explainable score: interests 0.35, rating 0.20, budget fit 0.15, travel style 0.10, activity level 0.10, popularity 0.05, and a crowd penalty when requested.
3. **Schedule:** choose a planner:
   - *Standard:* deterministic greedy heuristic, takes milliseconds.
   - *Optimized:* CP-SAT with hard constraints (opening hours, day window, activity limit, travel time, meals, must-visit and excluded places, daily budget) and an objective of maximising ranking score minus travel. It reports `OPTIMAL` / `FEASIBLE` with the remaining gap, or `INFEASIBLE` with reasons.
4. **Validate:** an independent validator re-checks every itinerary and every edit.
5. **Edit and adapt:** remove, replace with a place that fits the slot, regenerate a day, or adapt the whole trip (more relaxed, cheaper, avoid crowds, more active). Must-visit places are protected.
6. **Explain:** "Why this place?" shows the ranking reasons plus a Gemini explanation built only from retrieved records. Claims that cite nothing, or contain prices or hours not found in their sources, are dropped.
7. **Budget, map, feedback, saved trips:** a budget breakdown with stated assumptions, a map with day routes (straight lines, labelled as such), feedback, duplicate and delete.

## Evaluation (latest recorded results, details in [`evaluation/README.md`](evaluation/README.md))

| Evaluation | Headline result |
|---|---|
| Validator fault injection | 98/98 injected violations detected; 0/14 clean itineraries falsely flagged |
| Heuristic vs CP-SAT (7 feasible scenarios) | Both valid 7/7. CP-SAT: 83 vs 74 activities, 990 vs 1983 travel min, 0 vs 198 late min. 4/7 proven optimal. Slower (seconds vs ms). |
| Ranking vs baselines (8 profiles, proxy relevance) | P@5 0.975 vs 0.60 rating-only, 0.53 popularity, 0.45 random |
| RAG grounded generation | **Pending:** requires a Gemini API key (script ready) |

## Limitations (honest summary)

- **Sample data only.** Prices, hours and ratings come from the demo seed and are not verified; there is one destination.
- **Travel times are straight-line estimates** at 30 km/h, not road routing.
- **No authentication.** This is a single-user demo; run it on a trusted network.
- **No Alembic migrations.** Tables are created at startup. Vectors are stored as JSON and compared in Python; pgvector isn't used yet.
- **AI features need a Gemini key** and have not been evaluated live in this repository.
- Full list: [`docs/phase-11-report.md`](docs/phase-11-report.md).

## Documentation

- [Architecture](docs/architecture.md) · [Technology decisions](docs/technology-decisions.md) · [Feature inventory](docs/feature-inventory.md) · [Deployment](docs/deployment.md)
- Phase reports: [8 RAG](docs/phase-8-report.md) · [9 optimization](docs/phase-9-report.md) · [10 features](docs/phase-10-report.md) · [11 final verification](docs/phase-11-report.md)
