# Go-live checklist: from "needs the Mac" to "install from a link"

Today the app runs only with this Mac: the backend runs here, and the development build loads its code from Metro. To install Vromon on any phone from a link, three things must exist. Each step lists who has to do it.

## 1. The backend online over HTTPS

| Step | Who | Notes |
|---|---|---|
| Create a hosting account (Render recommended; the repo has `backend/Dockerfile`) | You | Free tier sleeps after 15 min idle (the first request then takes ~1 min); Starter ($7/month) doesn't |
| Push the code to GitHub so the host can build it | You approve; I can commit and push | Nothing is committed yet |
| Production database: Supabase Postgres (same project) | You copy the connection string from Supabase → Project Settings → Database | Set `DATABASE_URL=postgresql+psycopg://…`; migrations run on start-up |
| Environment variables on the host | You paste them; I'll list the exact set | `APP_ENV=production`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_PROVIDER`/`LLM_API_KEY`/`EMBEDDING_*` (optional), `ADMIN_TOKEN`, `SENTRY_DSN` (optional), `CORS_ORIGINS` |
| Map tiles (regions and cities, ~30 MB of `.pmtiles`) on a public URL | Me, once a bucket exists | e.g. a public Supabase Storage bucket `tiles`; the app reads `EXPO_PUBLIC_TILES_URL` |
| Smoke test: `GET https://<host>/health` and sign in from a phone on mobile data | Me | |

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
- **Push notifications:** EAS project id plus Firebase `google-services.json` (Phase 5 notes).
- **Over-the-air updates:** `expo-updates` with an EAS Update channel (needs the Expo account).
- **Legal pages:** host `docs/legal/privacy-policy.md` and `docs/legal/terms.md` (fill in the `[TO FILL]` items first).
