# Vromon — Deployment Guide

| Option | Status |
|---|---|
| Local backend (SQLite) + Expo Go | Verified (Phases 5–11) |
| Docker Compose (PostgreSQL 16 + backend image) | **Verified 2026-10-12**: build, startup seeding and ingestion, full API end-to-end flow, restart idempotency |
| Hosted backend (e.g. Render) | Documented below, **not executed** from this repository |
| Mobile store or standalone build (EAS) | Documented below, **not executed** (requires an Expo account) |

## 1. Docker Compose (recommended for a repeatable demo)

```bash
docker compose up --build            # http://localhost:8000/docs
BACKEND_PORT=8001 docker compose up  # if port 8000 is busy
docker compose down                  # keep data
docker compose down -v               # delete the database volume
```
For AI features, create a git-ignored `.env` in the repository root with `LLM_PROVIDER=gemini`, `LLM_API_KEY=…`, `EMBEDDING_PROVIDER=gemini` and `EMBEDDING_API_KEY=…`. Compose passes them through.

## 2. Hosted backend (Render or any container host)

1. Create a **PostgreSQL** database. A container's local disk is usually ephemeral, so SQLite data would be lost on redeploy.
2. Deploy the backend from `backend/Dockerfile`. The **build context must be the repository root**, because the image copies `data/seed`.
3. Set the environment variables:
   - `DATABASE_URL=postgresql+psycopg://…` (note the `+psycopg` driver prefix)
   - `APP_ENV=production`
   - `ADMIN_TOKEN=<long random value>` (otherwise `/rag/ingest` is disabled in production)
   - `CORS_ORIGINS=<your web origins>`, if a browser client is used
   - Optional: `LLM_*` and `EMBEDDING_*`
4. The container listens on `$PORT` (default 8000). The health check path is `/health`.
5. Security reminders:
   - There is **no user authentication**. Anyone who can reach the URL can read and modify all trips.
   - Put the API behind a private network, basic auth at a proxy, or add authentication before exposing it publicly.
   - The LLM endpoints have no rate limit, so a public URL can run up Gemini costs.

## 3. Mobile app builds (EAS)

1. `npx eas-cli@latest login`, then `npx eas-cli@latest build:configure` (creates `eas.json`).
2. Set `EXPO_PUBLIC_API_URL` to the hosted backend URL for the build profile. Use `https://`: Android blocks plain HTTP in release builds by default.
3. **Maps on Android standalone builds need a Google Maps API key:** add `plugins: [["react-native-maps", {"androidGoogleMapsApiKey": "…"}]]` in `app.json`. Expo Go works without one.
4. `npx eas-cli@latest build -p android --profile preview` produces an installable APK.

## 4. Data and schema changes

There are no Alembic migrations. Tables are created at startup (`create_all`), which **does not alter existing tables**. After a model change, either recreate the database (`docker compose down -v`, or delete `backend/vromon.db`) or write the migration by hand. Adding Alembic is the first recommended follow-up.
