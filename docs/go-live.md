# Go-live checklist: from "needs the Mac" to "install from a link"

Today the app runs only with this Mac: the backend runs here, and the development build loads its code from Metro. To install Vromon on any phone from a link, three things must exist. Each step lists who has to do it.

## 1. The backend online over HTTPS

| Step | Who | Notes |
|---|---|---|
| Create a hosting account (Render recommended; the repo has `backend/Dockerfile`) | You | Free tier sleeps after 15 min idle (the first request then takes ~1 min); Starter ($7/month) doesn't |
| Push the code to GitHub so the host can build it | You approve; I can commit and push | Nothing is committed yet |
| Production database: Supabase Postgres (same project) | You copy the connection string from Supabase → Project Settings → Database | Set `DATABASE_URL=postgresql+psycopg://…`; migrations run on start-up |
| Environment variables on the host | You paste them; I'll list the exact set | `APP_ENV=production`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`/`LLM_API_KEY`/`EMBEDDING_*` (optional), `ADMIN_TOKEN`, `SENTRY_DSN` (optional), `CORS_ORIGINS`, `ORS_API_KEY` or `ROUTING_PROVIDER` (road times; see below) |
| Map tiles (regions and cities, ~30 MB of `.pmtiles`) on a public URL | Me, once a bucket exists | e.g. a public Supabase Storage bucket `tiles`; the app reads `EXPO_PUBLIC_TILES_URL` |
| Smoke test: `GET https://<host>/health` and sign in from a phone on mobile data | Me | |

### Live chat on the host (friends and chat, step 10)

Chat messages reach open apps over a WebSocket (`wss://<host>/api/v1/ws`); push notifications reach closed ones. Render supports WebSockets on web services with no maximum connection time ([Render docs](https://render.com/docs/websocket)). What the server needs:

| Rule | Why | Where it's set |
|---|---|---|
| **Exactly one instance, with one uvicorn worker.** No autoscaling, no `--workers`, no second region | The hub that hands messages to open sockets is in the server's memory (`app/services/live.py`). Render's load balancer gives each socket to a random instance, so with two, a message saved on one wouldn't reach apps connected to the other. Scaling out later needs Postgres `LISTEN/NOTIFY` behind `Hub.publish` (technology decision 30) | Render: instance count 1 (the default) |
| **A plan that doesn't sleep** (Starter, not Free) | A sleeping server drops every socket and answers the next request after about a minute | Render plan |
| **Keepalive** | The server pings every 25 s (and uvicorn every 20 s at the protocol level); the app treats 60 s of silence as a dead connection and reconnects with backoff (1, 2, 4 … 30 s) | Built in |
| **Deploys close the sockets** | Render replaces the instance and closes its connections (30 s shutdown window). Apps reconnect to the new one and fetch what they missed, so nothing is lost or doubled, even in the moment both instances run | Nothing to do |
| **Frame size cap** `--ws-max-size 16384` | The socket's messages are tiny; uvicorn's default would read frames up to 16 MB | `backend/Dockerfile` |
| **Request size cap** (1 MB of JSON; photos up to their own limit) | Nothing else limits request bodies | `app/core/body_limit.py` |
| **Push notifications** need Firebase and EAS set up first | Without them the app still works: messages arrive live while it's open | See "Optional, any time" |

The first start on an empty Postgres database runs the migrations and seeds the catalogue and the map (about 10 s). Step 10 checked this on a fresh local PostgreSQL 16, and runs the whole backend test suite against PostgreSQL too: `TEST_API_POSTGRES_URL=postgresql+psycopg://localhost/<empty db> pytest`.

## 2. A standalone app build

| Step | Who | Notes |
|---|---|---|
| Choose: EAS Build (Expo account, cloud) or a release build on this Mac | You | EAS also keeps the Play signing key and enables over-the-air JS updates |
| Release configuration: `EXPO_PUBLIC_API_URL=https://<host>`, `EXPO_PUBLIC_TILES_URL=…`, Supabase URL and anon key, optional `EXPO_PUBLIC_SENTRY_DSN` | Me | Release builds block plain-HTTP traffic, so the backend must be HTTPS |
| Build the `preview` profile (APK, package `com.vromon.app.preview`, name "Vromon (Preview)") | Me (EAS: after you log in once) | Installs next to the dev build. **Local builds of preview/production must start with `APP_VARIANT=… npx expo prebuild -p android --clean`**: the dev variant's `android/` folder allows plain HTTP (for the local backend) and must not be reused |
| Supabase Auth redirect URLs for the new package (email links, Google sign-in) | You or me, in the Supabase dashboard | |

## 3. Getting it onto phones

| Option | Who | Notes |
|---|---|---|
| APK download link | Me | The phone asks to allow installs from the browser or file manager, once |
| Google Play internal testing | You create a Play developer account ($25, identity check can take days) | Then: `production` profile (AAB), listing (`docs/play-store/listing.md`), Data safety (`docs/play-store/data-safety.md`), privacy policy URL, account-deletion URL, testers' emails |

## Optional, any time

- **Crash reports:** create a free Sentry project. Set `EXPO_PUBLIC_SENTRY_DSN` (app) and `SENTRY_DSN` (backend); for readable stack traces also `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` in the build environment.
- **Push notifications** (friend requests, and from friends and chat step 9 messages, trip-room invites and places added to a plan): create a Firebase project and add the Android app (`com.vromon.app`); download `google-services.json` and set `GOOGLE_SERVICES_FILE` to it when building; set `EAS_PROJECT_ID` (`npx eas-cli@latest init`); upload the FCM V1 service-account key to EAS (`eas credentials` → Android → push notifications). The backend already sends through Expo (`PUSH_ENABLED` is on by default); nothing changes there.
- **Over-the-air updates:** `expo-updates` with an EAS Update channel (needs the Expo account).
- **Legal pages:** host `docs/legal/privacy-policy.md` and `docs/legal/terms.md` (fill in the `[TO FILL]` items first).
- **Road distances and times (trip planner step 5):** development uses OpenRouteService with a free key (`ORS_API_KEY` in `backend/.env`). Before launch, choose the best option: a self-hosted OSRM server for Bangladesh (free software; a small server, about $5–10 a month; no request limits) or a paid OpenRouteService plan. Only `backend/app/services/routing/` changes; road data already fetched is kept in the `route_cache` table. Without a key the app uses straight-line estimates and says so.
