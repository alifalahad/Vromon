# Vromon — Android App Agent Prompt
## Social travel map, map themes, friends, trips, and settings

**Product:** Vromon (intelligent adaptive travel itinerary planning, now with a personal and social travel map)
**Target:** A proper, installable **Android** app (development build → APK/AAB on Google Play). iOS and web come later from the same codebase, so nothing may block them.
**Written:** 2026-10-12, from an audit of the repository at commit `bc34328`.

> Read this whole file before writing code. The developer approves each phase before the next one starts (Section 11). Design screenshots are in [`docs/design-reference/`](docs/design-reference/). Open them whenever this file cites one.

---

# 1. How to use this prompt

1. Open the **repository root** in the coding agent.
2. Run **Phase 0** first. It writes no code. It audits the repo, confirms the decisions in Section 13 with the developer, and verifies library versions.
3. Run one phase per session. At the end of each phase, deliver the report in Section 12 and **stop**.
4. The developer runs the app on a real Android phone, then approves the phase or asks for fixes. Never start the next phase without explicit approval.

---

# 2. What already exists (verified audit, 2026-10-12)

Do not trust this table blindly: re-verify in Phase 0, because the repo may have changed since.

| Area | As built | Location |
|---|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2, Pydantic 2, OR-Tools CP-SAT itinerary optimizer, greedy scheduler, independent constraint validator, RAG with Google Gemini (`google-genai`) | `backend/` |
| Database | SQLite by default, PostgreSQL 16 + pgvector image via Docker Compose. **No Alembic migrations**: tables come from `create_all`, which never alters existing tables. Vectors stored as JSON. | `backend/app/models/models.py`, `docker-compose.yml` |
| API | `/api/v1`: destinations, places (+ recommendations), trips (CRUD, generate, regenerate, itinerary, item edit/replace/alternatives, day regenerate, adapt, budget, feedback), rag (search, ask, explanation, ingest, status) | `backend/app/api/v1/endpoints/` |
| Auth | **None.** Single-user demo. `Trip` has no owner. Anyone who can reach the API can read and change every trip. | — |
| Mobile | Expo SDK 57, React Native 0.86, React 19.2, TypeScript 6, Expo Router (routes live in `mobile/app/`), TanStack Query 5, Axios, React Hook Form + Zod, Zustand, `react-native-maps` 1.27 | `mobile/` |
| Mobile screens | 2 tabs (Explore, My Trips, emoji icons), destination detail, 6-step Plan-a-Trip wizard (`trip/new.tsx`: Where, When, Budget, Interests, Schedule, Review), trip detail, itinerary (day tabs, map, budget, feedback) | `mobile/app/` |
| Mobile theme | Dark navy/slate palette (`#0F172A` background, `#1E293B` cards, `#3B82F6` primary) | `mobile/src/theme.ts` |
| Data | One destination: Cox's Bazar (25 places, 10 restaurants, 8 hotels) | `data/seed/coxsbazar.json` |
| Tests/CI | pytest (backend), Jest + RNTL (mobile), ESLint, `tsc`; GitHub Actions workflow (not yet run on GitHub) | `backend/tests`, `mobile/src/__tests__`, `.github/workflows/ci.yml` |
| Run mode | Expo Go only. No `eas.json`, no development build yet. | — |
| Legacy | `demo/` (React + Vite web app + PWA) and `frontend/dist` are frozen. Read-only. | `demo/`, `frontend/` |

**Known gaps that block the new features:** no user accounts, no data ownership, no migrations, no object storage for photos, and `react-native-maps` cannot render a themeable world choropleth with country, region, and city layers.

**Note on `docs/design-reference/11-plan-trip-current-vromon.jpg`:** the floating gear button in the top-right corner is Expo Go's developer-tools button, not app UI. It disappears in a development or release build.

---

# 3. Non-negotiable rules

These override any instruction to work fast.

1. **Inspect before changing.** Read git status, `README.md`, `docs/architecture.md`, `docs/technology-decisions.md`, `mobile/AGENTS.md`, and the latest phase reports first.
2. **Expo changes every SDK. Do not trust memory.** Before using any Expo, React Native, or native-module API, read the docs for the installed SDK (`https://docs.expo.dev/versions/v57.0.0/`) and `https://docs.expo.dev/llms.txt`. Install with `npx expo install <pkg>` so versions match the SDK. Run `npx expo-doctor` after adding native modules.
3. **Routes stay in `mobile/app/`.** `mobile/AGENTS.md` says `src/app/`, but the project uses `mobile/app/`. Don't move routes unless the developer approves it as a separate change.
4. **Never hand-edit `android/` or `ios/`.** Use `app.json`/`app.config.ts` and config plugins (Continuous Native Generation).
5. **Privacy is enforced on the server, never only in the UI.** Every endpoint that returns user data checks ownership or an accepted friendship. Hiding a button is not access control.
6. **Secrets stay on the backend.** Nothing secret in `EXPO_PUBLIC_*`. Auth tokens go in `expo-secure-store`, never in AsyncStorage or logs.
7. **No fake data in real flows.** Mocks are allowed only inside automated tests. Don't invent travel facts, prices, or hours. (Same rule as the existing project.)
8. **Keep what works.** Keep the planner, optimizer, validator, RAG, and their tests passing. The existing wizard is re-skinned and re-wired, not rewritten.
9. **`demo/` is read-only.**
10. **Reference screenshots 14–23 come from a third-party app.** Reproduce the layout pattern and the colour values listed here. Don't copy its artwork, icons, photos, or texture bitmaps; draw your own pattern images (hatching, dots). The aeroplane photo behind the Trips stats card must be a licensed or original image.
11. **Git:** no commits, pushes, resets, or branch deletion without explicit permission. Preserve uncommitted user changes.
12. **Don't claim a feature works unless you exercised it** on an Android emulator or device, or covered it with a test. Say which.
13. **Run before declaring a phase done:** `npm run typecheck && npm run lint && npm test` in `mobile/`, `pytest -q` in `backend/`, and `npx expo-doctor`.

---

# 4. Technology: keep, add, replace

## 4.1 Keep

Expo SDK 57 + React Native + TypeScript, Expo Router, TanStack Query, Axios (single client), React Hook Form + Zod, Zustand, Jest + RNTL, ESLint, FastAPI, SQLAlchemy 2, Pydantic 2, OR-Tools, Gemini RAG, PostgreSQL 16.

**Why Expo and not native Kotlin:** a development build of this Expo app *is* a real native Android app (own package `com.vromon.app`, own icon, Play Store AAB, full native modules). Staying on Expo keeps the later iOS and web targets nearly free. A Kotlin/Compose rewrite would have to be redone for iOS.

## 4.2 Change how the app is built

| Change | Why |
|---|---|
| Expo Go → **development build** (`expo-dev-client`) + **EAS Build** profiles `development`, `preview` (APK), `production` (AAB) | MapLibre, camera, secure store, and notifications need native modules Expo Go doesn't ship. |
| Add **EAS Update** | Ships JS fixes to installed apps without a store release. |
| Release builds use **HTTPS** only | Android blocks cleartext HTTP in release builds. |

## 4.3 Add on mobile (verify each version against SDK 57 docs before installing)

| Need | Library | Notes |
|---|---|---|
| World map (countries / regions / cities, themes, textures) | **`@maplibre/maplibre-react-native`** | Open source, no Google key, runtime style JSON. Supports data-driven fills, `fill-pattern` textures, line blur for glow, and hillshade. Web later via `maplibre-gl` in a `.web.tsx` file, the same pattern as `TripMap.web.tsx`. It **replaces** `react-native-maps` for the travel map. Migrate the itinerary map to MapLibre in Phase 7 so the app has one map engine and no Google Maps key. |
| Haptics | `expo-haptics` | All feedback goes through one wrapper (Section 6.10). |
| Animation and gestures | `react-native-reanimated`, `react-native-gesture-handler` | Press-scale, sheet, and tab animations. |
| Bottom sheets | `@gorhom/bottom-sheet` | Map-view sheet, country sheet, add-place sheet. Confirm it supports the Reanimated version shipped with SDK 57. If not, use Expo Router's `formSheet` presentation. |
| Icons | `@expo/vector-icons` (MaterialIcons / MaterialCommunityIcons) | The tab icons in the screenshots are Material: `map`, `luggage`, `people`, `settings`. |
| Images | `expo-image`, `expo-image-picker`, `expo-image-manipulator` | Android photo picker, so no broad storage permission. Compress before upload. |
| QR | `expo-camera` (barcode scanning), `react-native-qrcode-svg` + `react-native-svg` | Show and scan friend codes. |
| Secure tokens | `expo-secure-store` | Access and refresh tokens. |
| Local preferences | `react-native-mmkv` (confirm New Architecture support) or `@react-native-async-storage/async-storage` | Appearance, language, haptics toggle, cached map theme. |
| Offline server cache | `@tanstack/query-async-storage-persister` + `persistQueryClient` | The map, friends list, and trips open offline. |
| i18n | `expo-localization` + `i18next` + `react-i18next` | English first, Bangla next. No hard-coded user-facing strings. |
| Push | `expo-notifications` (FCM v1 credentials via EAS) | Friend request received or accepted. |
| Long lists | `@shopify/flash-list` | Country (250+), region, and city lists. |
| Sharing | `expo-sharing`, `expo-clipboard`, `expo-linking` | Invite links and copying the friend code. |
| Crash reporting | `@sentry/react-native` | Plus backend Sentry. |
| E2E tests | **Maestro** | Android flows: sign-up, add friend by QR or code, mark a country, apply a theme. |

## 4.4 Add on the backend

| Need | Choice | Notes |
|---|---|---|
| Migrations | **Alembic** (first task in Phase 1) | Baseline the current schema, then every change is a migration. |
| Identity | **Decision D1** (Section 13). Recommended default: **Supabase Auth**; FastAPI verifies its JWTs (JWKS). Alternative: FastAPI-native auth (argon2 via `pwdlib`, short-lived JWT access + rotating refresh tokens, email verification and reset via Resend or Postmark). | A managed provider supplies email verification, password reset, and Google sign-in without custom security code. |
| Hosted Postgres + file storage | **Supabase** (Postgres with PostGIS and pgvector available, plus private Storage buckets), or Neon + Cloudflare R2 | Photos live in a **private** bucket. FastAPI hands out short-lived signed URLs only after the privacy check. |
| Photo processing | Pillow | Upload goes through FastAPI, which re-encodes the image, **strips EXIF (including GPS)**, makes a thumbnail, and stores it. |
| Rate limiting | `slowapi` (or the proxy) | Login, username search, friend requests, LLM endpoints. |
| Push sending | Expo Push API (`exponent_server_sdk`) | Store Expo push tokens per device. |
| Geo reference data | Natural Earth admin-0 and admin-1 (public domain), GeoNames `cities15000` (CC BY 4.0, attribution required) | Stored as reference tables (Section 8) and as vector tiles (Section 7). |
| Hosting | Render (existing `backend/Dockerfile`), HTTPS | Render's local disk is ephemeral, so no SQLite in production. |

## 4.5 Map data pipeline (new: `scripts/geo/`)

1. Download Natural Earth admin-0 (countries) and admin-1 (states/provinces/divisions), plus GeoNames cities. Record versions and licences in `docs/data-sources.md`.
2. Natural Earth publishes point-of-view variants for disputed borders. Pick one deliberately (Decision D5) and document it.
3. Build vector tiles with `tippecanoe` into **PMTiles** (or static `z/x/y` MVT tiles if MapLibre Native in the installed version can't read PMTiles; verify this). Feature properties: `iso_a2`, `iso_a3`, `iso_3166_2`, `geonameid`, `name`, `name_bn`, `continent`.
4. Host the tiles and the glyph (font) PBFs on a CDN (R2, Supabase Storage public bucket, or similar).
5. **Bundle a simplified admin-0 layer inside the app**, so the Countries view works offline on first launch.
6. Generate `countries.json`, `regions.json`, and `cities.json` lookup files for search and seed them into the reference tables.
7. Put licence attributions in Settings → About → Licenses.

---

# 5. Design system

## 5.1 Visual language (dark appearance, from the screenshots)

| Token | Value | Source |
|---|---|---|
| `bg` | `#262626` | Screen background (`12-friends-empty.jpg`) |
| `surface` | `#333333` | Tab bar, cards, bottom sheets, map theme button |
| `surfaceRaised` | `#454545` | Floating pill button ("Countries") on the map |
| `surfaceInset` | ≈ `#1F1F1F` | Segmented-control track, stat tiles inside cards (estimate; tune against `03`, `09`) |
| `segmentThumb` | ≈ `#5E5E60` | Selected segment (estimate) |
| `accent` | `#3379F3` | FAB, Apply, active tab, links ("Invite", "add via code"), selected card border |
| `textPrimary` | `#FFFFFF` / `#F2F2F2` | Titles, values |
| `textSecondary` | `#B2B2B2` | Inactive tab labels, row values ("English", "System") |
| `textTertiary` | `#858585` | Hints |
| `divider` | ≈ `#4A4A4A` | Inset dividers in Settings |
| `success` | ≈ `#4CAF50` | "Duration 20 days" |

Define light-appearance equivalents too; **Appearance = System / Light / Dark** is a setting. Replace the slate palette in `mobile/src/theme.ts` with semantic tokens (`useTheme()`), and re-skin every existing screen, the Plan-a-Trip wizard included, to the new tokens.

**Shape and type:** cards have a radius of about 24 dp. Buttons are full pills. The FAB is a 64 dp circle with a soft shadow. The map theme button is a 64 dp rounded square with a 1 dp border. Titles are large and bold ("Trips", "Friends" at about 34 sp). Use the system font (Roboto) unless the developer picks a brand font.

## 5.2 Interaction quality bar

- Every tappable element animates: scale to 0.97 on press with a spring, and fires a haptic (Section 6.10).
- Screen transitions use native stack animations. Sheets drag, snap, and dismiss with a gesture.
- Skeleton loaders, not spinners, for lists and cards. Every list has a designed empty state (see `12-friends-empty.jpg`).
- Respect "Reduce motion": swap animations for fades.
- Touch targets at least 48 dp. TalkBack labels on every control. Text scales with the system font size.

---

# 6. Product specification

## 6.1 Bottom navigation (match `01-bottom-nav.jpg` exactly)

Four tabs in this order: **Map · Trips · Friends · Settings**. `01-bottom-nav.jpg` also shows a Passport tab. Leave it out (see 6.11), and match everything else in that screenshot exactly. Spread the four tabs evenly across the bar.

- Bar background `surface`, no top border, sits above the system gesture bar (safe-area aware).
- Material icons about 28 dp, filled. Label under the icon, about 14 sp.
- Active: icon and label in `accent`. Inactive: `textSecondary`.
- Tap: `selection` haptic plus a small icon scale bounce. Re-tapping the active tab scrolls to top or recentres the map.
- Replace the current two-tab layout (`mobile/app/(tabs)/_layout.tsx`, emoji icons). The old "Explore" destination list moves into the Plan-a-Trip flow ("Where to?").

## 6.2 Accounts

- Sign up with email and password, plus Google sign-in (Decision D1). Then claim a **unique username** (3–20 characters, `a-z0-9._`, case-insensitive uniqueness, live availability check with debounce) and optionally add a display name, profile photo, and home country.
- Sign in, sign out, forgot password, email verification.
- Onboarding (first launch after sign-up): username → home country → "mark countries you've visited" (multi-select list with search) → done.
- **Delete account** inside the app (a Google Play requirement), with a confirmation step. Deletes the user's photos, visits, trips, and friendships server-side. Also provide a web URL for deletion requests (Play Data safety form).
- Existing trips: today they have no owner. Migration plan per Decision D4.

## 6.3 Privacy model (enforced on the server)

| Data | Owner | Accepted friend | Anyone else |
|---|---|---|---|
| Username, display name, avatar | ✓ | ✓ | Only in username search results and QR scans (Decision D3), so a request can be sent |
| Travel map (visits: visited / want to visit / lived) | ✓ | ✓ read-only | ✗ |
| Travel stats (countries, regions, cities, % of world, trip stats) | ✓ | ✓ read-only | ✗ |
| Photos | ✓ | ✓ read-only (signed URLs, short expiry) | ✗ |
| Trips and itineraries | ✓ | ✓ read-only | ✗ |
| Map theme | ✓ | Their own theme renders their own view | — |

- Accounts are **private by default**. There is no public profile.
- Settings toggle: "Let people find me by username" (default on). When it's off, only QR or code works.
- Removing a friend revokes access immediately. Blocking also hides the user from search and rejects their requests.
- Write automated tests that prove a non-friend gets `404` (not `403`, to avoid confirming that something exists) for every user-data endpoint.

## 6.4 Friends tab (`12-friends-empty.jpg`)

- Header "Friends". FAB `+` at bottom-right opens **Add friend**:
  1. **Search by username**: results show avatar, display name, @username, and a button whose state is Add / Requested / Friends / Accept.
  2. **Scan QR**: camera with a permission explainer; on a valid scan, show the profile preview and an "Add friend" button.
  3. **My code**: my QR code plus my friend code text, with Copy and Share (share sends a `https://…/add/<code>` link that opens the app through an Android App Link, falling back to the `vromon://add/<code>` scheme).
- The QR contains an **opaque, rotatable friend code**, never the internal user ID. "Regenerate code" invalidates the old one.
- Empty state exactly as the screenshot: "No Friends Yet" + "**Invite** your friends to see their travel progress, or **add via code**". Both links are accent-coloured and tappable.
- Sections: Requests (incoming, with Accept/Decline; outgoing, with Cancel), then the Friends list (avatar, name, countries count, % of world per Decision D6).
- Friend detail: header (avatar, display name, @username), their map (read-only), travel stats (countries, regions, cities, % of world), photos, trips, a **Compare maps** button, and Remove / Block in an overflow menu.
- Push notification and in-app badge on the Friends tab for incoming requests and acceptances.

## 6.5 Map tab (`02-map-home-dark.jpg`, `08-map-view-sheet.jpg`)

- Full-bleed world map under a transparent status bar, labelled by country names at low zoom. Pinch and pan; double-tap zooms.
- **Top-right:** map theme button (palette icon in a 64 dp `surface` rounded square with a border) opens the Map Theme screen (6.6).
- **Bottom-left:** pill button showing the current view (icon + "Countries" / "Cities" / "Regions"). Tapping it opens the **Map view** bottom sheet:
  - Title "Map view", a circular ✕ close button, and three circular options (Countries = globe icon, Cities = buildings icon, Regions = grid icon).
  - Selected option: accent ring, accent icon, and accent label. The map behind dims about 60%.
  - Choosing an option switches the layer with a short crossfade, then closes the sheet.
- **Bottom-right:** FAB `+` opens **Add place**: search (countries, regions, or cities, matching the current view) → choose a status **Visited / Want to visit / Lived** → optional dates and photos → Save. Success haptic, and the shape animates its fill colour on the map.
- **Views:**
  - **Countries:** admin-0 polygons filled by status colour.
  - **Regions:** admin-1 polygons (divisions, states, provinces) filled by status. Country outlines stay visible.
  - **Cities:** a point per city with a status colour (see the dots over Bangladesh in `02`); clusters at low zoom.
- **Tap a feature** to open a country/region/city sheet: flag, name, status toggle (three segmented choices plus "Clear"), dates, counts of regions and cities visited inside it, photos, and trips there.
- **Rules:** *Lived* also counts as visited in stats. Marking a city or region visited also marks its country visited (ask once: "Also mark Bangladesh as visited?" with a "don't ask again" option).
- Legend chips (Visited / Want to visit / Lived) are shown when the user has used more than one status (`14-colors-wonder-calm.jpg` shows the pattern).

## 6.6 Map Theme screen (`03`–`07`, `14`–`23`)

Layout (matches `03-theme-midnight.jpg`):

1. Header with back arrow and title "Map Theme".
2. **Live preview** map (Europe crop, about the top 45% of the screen) showing the user's real visits, or a sample set if they have none. It updates immediately when a card is selected.
3. Segmented control **Map | Friends**. *Friends* switches the preview to comparison mode and shows a legend row above it ("In common", "You", "Friend", each with a swatch; see `07`).
4. Catalog switcher with three chips: **Themes | Colors | Styles**.
   - *Themes:* the four complete presets with 5-stripe swatch cards (`03`–`06`).
   - *Colors:* status palettes with 3-stripe cards (`14`–`17`).
   - *Styles:* base-map styles with a thumbnail preview card (`18`–`23`).
5. A horizontal card carousel with snapping. The selected card gets an accent border and a `selection` haptic.
6. **Apply** button (full-width accent pill). It saves the selection to the account (synced across devices), cached locally, fires a `success` haptic, and pops back to the map with the new theme.

Picking a Theme sets style, colors, and compare colors together. Picking a Color or Style afterwards turns the selection into "Custom" and keeps the other parts. The current theme name appears in Settings → Map Theme (`13-settings-rows.jpg`).

**Locks:** the reference shows lock icons (premium). Every item carries `tier: 'free' | 'premium'`. Behaviour per Decision D2 (default: everything unlocked, lock UI hidden behind a feature flag).

Full catalog data: Section 7.

## 6.7 Friend map comparison (`07-theme-friends-compare-rustic.jpg`)

- Reachable from a friend's profile ("Compare maps") and from the Map Theme preview.
- Fill colours: **In common** (both visited), **You** (only me), **Friend** (only them), all from the active theme's compare colours. In-common fill renders at about 60% opacity over land (measured from the Rustic screenshot).
- Under the map: counts for "N in common · N only you · N only <name>", each expandable into a flag list. Works in all three views.

## 6.8 Trips tab (`10-trips-tab.jpg`, `09-trip-stats-travel-time.jpg`)

- Large title "Trips".
- **Stats card** with a background travel image and a warm orange overlay. Fields: Trips, Duration (`0d`), Continents, Countries, Cities. Row: "All trip stats ›".
- **All trip stats** screen:
  - "Travel time": `N Total days`, plus three tiles for Weeks, Months, and Years, each with 2 decimals. Weeks = days / 7, months = days / 30.44, years = days / 365.25.
  - "Average trip time": `X.X days` = total days / completed trips.
  - Optionally: longest trip, most-visited country, trips per year chart, transport-mode breakdown.
- **Stats count only completed trips** (end date before today). The screenshot shows 0 trips while one upcoming trip exists; keep that behaviour.
- Duration = end − start + 1 days (12–31 Oct 2026 = **20 days**, as in the screenshot).
- Sections: **Upcoming**, **Ongoing**, **Past**. Trip card: calendar icon + date range, "Duration **N days**" (green), then the list of stops with country flag, transport mode icon and label (Plane, Bus, Train, Car, Boat, Walk), and "City, Country". A dotted vertical connector joins the flags.
- **FAB `+` opens "Plan a Trip"**: the existing 6-step wizard (`11-plan-trip-current-vromon.jpg`: Where, When, Budget, Interests, Schedule, Review), re-skinned to the new tokens, owned by the signed-in user, and returning to the Trips tab when it finishes. The existing trip detail and itinerary screens (generate, edit, adapt, budget, explain, feedback) stay reachable from the trip card.
- When a trip ends, offer "Mark these places as visited on your map?" (one tap).
- The data model for transport legs is Decision D7.

## 6.9 Settings tab (`13-settings-rows.jpg`)

Row style: icon at left, title, muted value at right, chevron, and an inset divider. Sections:

- **Profile:** avatar, display name, username (change, with availability check), home country, email.
- **Account:** password / sign-in methods, sign out.
- **Privacy & friends:** my QR / friend code, regenerate code, "Let people find me by username", blocked users.
- **Preferences:** **Language** (English, বাংলা), **Appearance** (System / Light / Dark), **Map Theme** (current name → Map Theme screen), **Haptic feedback** (on/off), distance units (km/mi).
- **Notifications:** friend requests, request accepted, trip reminders.
- **Data:** export my data (JSON), **delete account**.
- **About:** version and build number, licences and data attributions (Natural Earth, GeoNames, OpenStreetMap if used, MapLibre), privacy policy, terms, send feedback, rate the app.

Every preference applies immediately with a `selection` haptic and persists locally. Account-level preferences also sync to the server.

## 6.10 Haptics and interaction (applies to every button)

Create one module, `mobile/src/ui/haptics.ts`, and one pressable component, `mobile/src/ui/PressableScale.tsx`. Screens never call `expo-haptics` directly and never use a bare `Pressable` for interactive UI. Add a lint rule (`no-restricted-imports`) to enforce this.

| Interaction | Haptic (`expo-haptics`) |
|---|---|
| Tab change, segmented control, chip, carousel card, toggle, picker step, sheet snap | `selectionAsync()` |
| Ordinary button, list row, map feature tap | `impactAsync(Light)` |
| FAB, Apply, Next/Save, long-press on a map feature | `impactAsync(Medium)` |
| Friend request sent or accepted, theme applied, trip saved, place marked, QR scanned successfully | `notificationAsync(Success)` |
| Destructive confirm (remove friend, delete trip, delete account) | `notificationAsync(Warning)` |
| Validation failure, network error, invalid QR | `notificationAsync(Error)` |

- Respect the Settings toggle. On Android, check whether SDK 57's `expo-haptics` offers `performAndroidHapticsAsync` with system haptic constants; prefer those on Android if it does (verify in the docs).
- Combine every haptic with a visual press state (scale 0.97 spring, or opacity on rows).

## 6.11 Not in scope for now: Passport

The Passport feature is **deferred**. Don't build a Passport tab, screen, placeholder, endpoint, or table, and don't add it to onboarding or Settings. The travel stats that friends and trips need (countries, regions, cities, continents, % of world) live in one reusable module on each side: `backend/app/services/stats/` and `mobile/src/features/stats/`. A Passport tab can then be added later without rework.

---

# 7. Map theme catalog (colour data)

Put this in `mobile/src/features/mapThemes/catalog.ts` as typed data, with a unit test checking every hex value and that every ID is unique. Values were sampled from the screenshots (±2 per channel for JPEG noise). "Rendered" columns are what the reference preview actually draws; tune the style JSON until the preview matches the screenshot side by side.

## 7.1 Model

```ts
type MapStyle  = { id; name; tier; land; water; border; label; labelHalo; pattern?: 'hatch'|'dots'; terrain?: boolean; borderGlow?: boolean };
type MapColors = { id; name; tier; visited; wantToVisit; lived };
type Compare   = { you; friend; inCommon; inCommonOpacity: number };
type MapTheme  = { id; name; tier; styleId | inline style; colors; compare; swatches: string[] /* card stripes */ };
type UserMapTheme = { themeId?: string; styleId: string; colorsId: string; compare: Compare }; // "Custom" when themeId is absent
```

## 7.2 Themes (complete presets, 5-stripe cards: `03`–`06`)

Stripe order, inferred from the rendered previews (confirmed for Rustic and Serenity): **land, water, visited/You, Friend, In common**.

| Theme | Stripe 1 (land) | Stripe 2 (water) | Stripe 3 (visited / You) | Stripe 4 (Friend) | Stripe 5 (In common) | Rendered in preview |
|---|---|---|---|---|---|---|
| **Default** | `#D9D9D9` | `#A6A7A9` | `#F08E35` | `#91C4BF` | `#BDA5BD` | Dark appearance: land `#303030`, water `#1A1A1A`, visited `#F1AD48`. Light appearance: use the stripe values. Default follows Appearance. |
| **Midnight** | `#1A1A1A` | `#2B2B2B` | `#866F43` | `#636363` | `#553F31` | land `#353229`, water `#24251F`, visited `#866F43` |
| **Serenity** | `#F1E5D5` | `#AEBCC9` | `#CFB5DC` | `#7F8B8B` | `#9C9C9C` | land `#EDEADB`, water `#A2B4C2`, visited `#CFB5DC` |
| **Rustic** | `#E8DEC3` | `#DFCDA5` | `#A28D78` | `#587F6C` | `#6B505F` | land `#EEE9D6`, water `#D4C7A4`, visited `#A28D7A`, friend `#587F6C`, in common `#AB898A` (≈60% opacity) |

The Themes carousel may continue beyond Rustic in the reference app. Ask the developer for screenshots of any further cards.

For presets, *Want to visit* = the visited colour at 35% fill with a solid 1.5 dp outline, and *Lived* = the visited colour darkened 20% in lightness. (Proposal; the developer may override this.)

## 7.3 Colors (status palettes, 3-stripe cards: `14`–`17`)

Stripe order: **Visited, Want to visit, Lived**.

| Palette | Visited | Want to visit | Lived |
|---|---|---|---|
| **Default** (legend in `14`) | `#B7268B` | `#4094F6` | `#4712A2` |
| **Wonder** | `#3C87AE` | `#B5BC9B` | `#89C591` |
| **Calm** | `#BAB7D6` | `#C8E5ED` | `#EABBB1` |
| **Bright** | `#D95763` | `#66E2E4` | `#7EE464` |
| **Sunrise** | `#F4F47A` | `#D779CD` | `#63D08C` |
| **Adrenaline** | `#6BD771` | `#4C3ADE` | `#EB9D38` |
| **Sky** | `#72DDED` | `#193972` | ❓ (cut off) |
| **Intrepid** | ❓ (cut off) | `#777A43` | `#404179` |
| **Burst** | `#611A84` | `#A7F377` | `#4091E3` |
| ❓ name ends in "…st" (before Adrenaline) | ❓ | ❓ | `#972A49` (only the last stripe is visible) |
| ❓ (after Burst) | `#3068DF` | ❓ | ❓ |

Ask the developer for full screenshots of the ❓ cards. Until then, ship only the complete palettes.

## 7.4 Styles (base maps, thumbnail cards: `18`–`23`)

| Style | Land | Water | Borders / special |
|---|---|---|---|
| **Default (light)** | `#EAECDE` | ≈ `#A5D8F5` (estimate) | Soft terrain shading, thin grey borders (`14`–`23` background map) |
| **Default (dark)** | `#303030` | `#1A1A1A` | Grey borders, light labels (`02`) |
| **Carbon** | `#242424` | `#D6F6F3` | Thin light-grey borders |
| **Pencil** | `#E1E1E1` | `#B3B3B3` | Water drawn with **diagonal hatch** (`fill-pattern`), grey borders |
| **Sahara** | `#FAF6DD` | `#F2E5B8` | Pale sand borders |
| **Azure** | `#CADAF1` | `#ADC6E5` | Blue-grey borders |
| **Glow** | `#1E4F60` | `#18303A` | Light teal borders with **blur glow** (`line-blur`) |
| **Bubble** | `#FAF8F9` | `#DEDEEA` | Pink-grey borders |
| **Glacier** | `#DEF3F8` | `#FFFFFF` | Light blue-grey borders (ice land, white sea) |
| **Blackout** | `#000000` | `#212E25` | Dark green-grey borders |
| **Treasure** | `#EEE8D8` | `#ABCBCA` | Water with a **dot pattern**, purple-grey borders (parchment look) |
| **Midnight** | `#1F2636` | `#0D1215` | Slate borders |
| **Odyssey** | `#CCDCB8` | `#DEF3F8` | **Terrain hillshade** (raster-dem source). Can ship in a later phase. |
| **Rose** | `#F7F6FB` | `#E1D4DE` | Dusty pink borders |
| ❓ two partially visible cards (land ≈ `#F4F5EF`; land ≈ `#EEF3EF` / water ≈ `#DFE6DE`) | | | Ask the developer for screenshots |

---

# 8. Backend data model and API (additions)

Everything below lands through **Alembic migrations**.

```
users(id uuid pk, auth_subject unique, email unique, username citext unique, display_name,
      avatar_key, home_country_iso2, discoverable bool default true, friend_code unique,
      created_at, deleted_at)
user_settings(user_id pk/fk, language, appearance, haptics bool, units, map_theme jsonb, updated_at)
devices(id, user_id, expo_push_token unique, platform, last_seen_at)
friend_requests(id, from_user_id, to_user_id, status pending|accepted|declined|cancelled, created_at, responded_at,
                unique(from,to) where status='pending')
friendships(user_a_id, user_b_id, created_at, pk(user_a_id,user_b_id), check(user_a_id < user_b_id))
blocks(blocker_id, blocked_id, created_at)
countries(iso2 pk, iso3, name, name_bn, continent, is_un_member)        -- seeded from Natural Earth
regions(code pk /*ISO 3166-2*/, country_iso2, name, name_bn)             -- seeded from Natural Earth admin-1
cities(geonameid pk, country_iso2, region_code, name, lat, lon, population)
visits(id, user_id, place_type country|region|city, place_code, status visited|want|lived,
       first_visited_on, last_visited_on, note, created_at, updated_at, unique(user_id, place_type, place_code))
photos(id, user_id, storage_key, thumb_key, width, height, taken_on, place_type, place_code, trip_id null, created_at)
trips: + user_id fk (not null after migration), + stops/legs per Decision D7
```

Endpoints (all under `/api/v1`, all authenticated unless noted):

- `GET/PATCH /me`, `DELETE /me` (account deletion), `GET /me/export`, `GET/PUT /me/settings`
- `GET /usernames/{name}/available` (rate-limited)
- `GET /users/search?q=` (prefix match, discoverable users only, excludes blocked users, rate-limited)
- `GET /friend-codes/{code}` → minimal profile preview; `POST /me/friend-code/rotate`
- `POST /friend-requests` (by user ID or friend code), `GET /friend-requests?direction=in|out`, `POST /friend-requests/{id}/accept|decline|cancel`
- `GET /friends`, `DELETE /friends/{user_id}`, `POST /blocks`, `DELETE /blocks/{user_id}`
- `GET /users/{id}/visits`, `PUT /me/visits` (batch upsert), `DELETE /me/visits/{type}/{code}`
- `GET /users/{id}/stats` (server-computed: countries, regions, cities, continents, % of world), `GET /users/{id}/compare` (in common / only me / only them per view)
- `POST /me/photos` (multipart → re-encode, strip EXIF, thumbnail), `GET /users/{id}/photos` (signed URLs), `DELETE /me/photos/{id}`
- `GET /me/trips/stats` (completed trips only), existing `/trips…` endpoints scoped to the owner, with read-only access for friends
- `POST /me/devices` (register push token)
- Reference data (public, cacheable): `GET /geo/countries`, `GET /geo/regions?country=`, `GET /geo/cities?q=`

One dependency function, `require_viewer_can_see(user_id)`, guards every `/users/{id}/…` route. Required tests: owner ✓, friend ✓ read-only, stranger → 404, blocked → 404, after unfriend → 404, write by a friend → 404.

---

# 9. Non-functional requirements

- **Performance:** cold start under 2.5 s on a mid-range Android phone (release build). Map pans at 60 fps. The status fill update is a style-expression change (`match` on the ISO code), never a GeoJSON rebuild per tap.
- **Offline:** the Countries view, my visits, friends list, and trips open from cache. Edits made offline queue and sync, with a conflict rule of last-write-wins per visit.
- **Security:** HTTPS only. Tokens in secure store. Rate limits on auth, search, and requests. Signed photo URLs expire within 15 minutes or less. No user IDs in QR codes. Server-side input validation through Pydantic.
- **Accessibility:** TalkBack labels, at least 48 dp targets, WCAG AA text contrast on every theme (legend text included). Status is never conveyed by colour alone: the country sheet shows the status as text.
- **Localization:** all strings through i18next. Dates and numbers formatted by locale. Bangla country names from Natural Earth `NAME_BN`.
- **Play Store:** target the API level Google Play currently requires (verify), AAB signed through EAS, Data safety form, privacy policy URL, in-app and web account deletion, a permission rationale before the camera opens.

---

# 10. Testing

- **Backend:** pytest for every new endpoint, the privacy matrix (Section 8), migrations up/down on PostgreSQL, EXIF stripping (upload a photo with GPS and assert it's gone), and the stats maths (20-day example, weeks/months/years, completed-only).
- **Mobile unit:** theme catalog validity, stats formatting, username validation, haptics wrapper (mocked), `PressableScale` fires a haptic plus `onPress`, the visit-status → style-expression builder.
- **Mobile component (RNTL):** the tab bar renders 4 tabs in order (no Passport), the Friends empty state links, the Map Theme carousel selection and Apply, the Map-view sheet switching.
- **E2E (Maestro, Android emulator):** sign up → claim username → mark Bangladesh visited → apply the Rustic theme → add a friend by code (second test account) → accept → compare maps → plan a trip via `+`.
- **Manual on a real phone, every phase:** haptics feel right, dark and light appearance, TalkBack pass, offline airplane-mode pass.

---

# 11. Phased plan (one phase per session; stop for approval after each)

| Phase | Scope | Done when |
|---|---|---|
| **0. Audit and decisions** (no code) | Re-verify Section 2. Read SDK 57 docs for every library in 4.3 and record compatible versions. Present Section 13 to the developer and record the answers in `docs/technology-decisions.md`. Write `docs/android-app-plan.md`. | The developer has approved the decisions and the plan. |
| **1. Foundations** | `expo-dev-client`, `eas.json` (development/preview/production), app config. Design tokens, light/dark, `useTheme`. `haptics.ts` + `PressableScale` + lint rule. New 4-tab shell (Map, Trips, Friends, Settings) with Material icons and placeholder screens. i18n scaffolding. Settings: Appearance, Language, Haptics (local). **Backend: Alembic baseline.** Existing screens re-skinned. | A dev build installs on Android. Tabs match `01`. Haptics work. All existing tests pass. |
| **2. Accounts and privacy core** | Identity per D1. `users`, `user_settings`, username claim, onboarding, profile editing, sign out, delete account, export. `trips.user_id` migration per D4. `require_viewer_can_see`. Secure token storage, Axios auth interceptor with refresh. | Two accounts on two devices are fully isolated. Privacy tests pass. |
| **3. World map** | Geo pipeline (4.5), reference tables, MapLibre map, Countries/Regions/Cities views + Map-view sheet (`08`), Add place, feature sheet, visits sync, offline countries layer. | Marking places works in all three views, survives a restart, and works offline. |
| **4. Map themes** | Catalog (Section 7), Map Theme screen (6.6), live preview, Apply, sync, Settings row value. Patterns (Pencil, Treasure), glow, terrain (Odyssey may slip to Phase 8). | Every catalog item renders and matches its screenshot side by side. |
| **5. Friends** | Search, QR show/scan, friend code links, requests, friends list, friend detail, remove/block, compare maps (6.7), push notifications. | Two real phones can become friends by QR and by username, compare maps, and unfriend. Strangers see nothing. |
| **6. Photos** | Photo upload/view/delete on the place sheet, trips, and friend detail. EXIF stripping, signed URLs, friend view. | A friend sees photos; a stranger can't, even with a copied URL after expiry. |
| **7. Trips** | Trips tab (6.8), stats card, All trip stats, upcoming/ongoing/past, FAB → re-skinned wizard owned by the user, mark-visited prompt, itinerary map migrated to MapLibre, `react-native-maps` removed. | Stats match the formulas. The 20-day example reproduces. The planner still passes its tests. |
| **8. Hardening and release** | Accessibility, performance, offline queue, Sentry, Maestro suite, EAS Update, Play Store listing assets, Data safety, privacy policy, internal testing track. | A signed AAB is on the Play internal test track and the Section 9 checks pass. |

---

# 12. Report format (end of every phase)

1. **Summary:** what changed and why (5–10 lines).
2. **Files:** created, modified, and deleted, grouped by area.
3. **Commands run** and their real output for typecheck, lint, tests, `expo-doctor`, and pytest. Failures shown, not hidden.
4. **How verified:** emulator, device (model), or test-only, per feature.
5. **Screenshots** of new screens next to the matching reference image.
6. **Deviations** from this prompt, with reasons.
7. **Known issues and risks.**
8. **Decisions needed** before the next phase.
9. Then **stop** and wait for approval.

---

# 13. Decisions to confirm in Phase 0 (recommended default first)

| # | Decision | Options (recommended first) |
|---|---|---|
| D1 | Identity provider | **Supabase Auth** (+ Supabase Postgres and Storage) · Firebase Auth (+ separate DB and storage) · FastAPI-native JWT |
| D2 | Premium locks | **All free for now, lock UI behind a flag** · Some items premium from launch (needs Play Billing) |
| D3 | What a non-friend sees in search or QR results | **Username, display name, avatar** · Username only |
| D4 | Existing ownerless trips | **Assign to the first account created in dev, delete in production** · Delete all · Keep as public samples |
| D5 | Disputed-border point of view (Natural Earth) | **Bangladesh POV** (primary market) · Default NE POV |
| D6 | Country total for "% of world" | **195 (UN members + 2 observers); territories listed but counted separately** · All ~250 ISO entries |
| D7 | Trip legs (Plane/Bus… stops in `10`) | **Add a `trip_stops` table (order, city, country, transport mode, dates); the wizard creates one stop for the destination and lets the user add an origin** · Leave stops out for now |
| D8 | Missing catalog items (❓ in 7.2–7.4) | **Developer sends full screenshots** · Ship the known items only |
| D9 | Brand font | **System (Roboto)** · A custom font via `expo-font` |
