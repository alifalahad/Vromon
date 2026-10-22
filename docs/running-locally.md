# Running Vromon on your Android phone

Three things run on your Mac: the **backend** (API, port 8001), **Metro** (serves the app's JavaScript, port 8081) and, once per native change, a **Gradle build** (the app itself). The phone reaches the Mac over the USB cable (`adb reverse`), so Wi-Fi addresses don't matter.

## Every time (3 terminals)

**Terminal 1: backend**
```bash
cd ~/Codes/Vromon/backend
venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8001
```
Check: http://127.0.0.1:8001/health shows `"status":"healthy"`. (Port 8000 is used by another project on this Mac, so Vromon uses 8001.)

On start the backend brings the database up to date by itself (migrations) and loads the destinations in `data/destinations/` (only the ones that changed), so there's nothing else to run. Real road times need `ORS_API_KEY` in `backend/.env`; without it the app uses straight-line estimates and says so.

**Terminal 2: phone connection** (plug in the USB cable, phone unlocked)
```bash
adb devices                       # your phone must show as "device"
adb reverse tcp:8081 tcp:8081     # Metro
adb reverse tcp:8001 tcp:8001     # backend
```
Run the two `adb reverse` lines again whenever you unplug and replug the phone.

**Terminal 3: Metro**
```bash
cd ~/Codes/Vromon/mobile
npx expo start --dev-client --clear
```
Then open **Vromon (Dev)** on the phone. If it asks for a server, choose `http://127.0.0.1:8081`. Shake the phone (or long-press with three fingers) for the developer menu; press `r` in this terminal to reload.

## Only after a native change (new library with native code, app.config.ts edits)

```bash
cd ~/Codes/Vromon/mobile
npx expo prebuild --platform android --no-install
cd android
JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk-22.jdk/Contents/Home \
ANDROID_HOME=$HOME/Library/Android/sdk \
./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a   # your phone only: much faster than all 4 CPU types
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
Use JDK 22 (or 17/21): JDK 24 and newer fail the build. If the app shows **"Cannot find native module …"**, the phone still has an older build: rebuild and install as above. Never edit `android/` by hand; it is generated from `app.config.ts`.

## Trying the trip planner on the phone

- **Plan a trip:** Trips tab → **+ Plan a trip** → pick a destination (scroll the row sideways: 11 of them) → dates → interests → must-sees → **Build my plan**.
- **Budget, weather, roads:** on the trip, tap the budget at the top right, the "Updated … ago" pill, or a travel leg.
- **Today mode:** opens by itself from the Trips tab while a trip is on (and the evening before). In this development build you can try it on any day of a planned trip with a link (a trip id, a date of the trip, a time):
  ```bash
  adb shell am start -a android.intent.action.VIEW -d "vromon://trip/today/<trip id>?date=2026-10-24&at=11:00"
  ```
  The trip id is the number in the backend's log when the trip opens (`GET /api/v1/trips/<id>/itinerary`).
  The `date` and `at` overrides work only in development builds.
- **The screen timer** (development builds): Metro's terminal prints `[perf] trip screen: … ms (cache)` each time a trip opens.

## Rebuilding the destination data (only to refresh it)

```bash
cd ~/Codes/Vromon/backend
venv/bin/python -m scripts.import_destinations            # all 10, from Wikivoyage and Wikidata (cached for a week)
venv/bin/python -m scripts.import_destinations --only Sylhet
```
It rewrites `data/destinations/*.json` and `docs/trip-planner/data-quality.md`; restart the backend to load them. The list of destinations and their areas is `data/destinations/sources.json`.

## Phone tests (Maestro)

Needs the two throwaway test accounts (see `mobile/.maestro/config.yaml` for the values to pass). They sign the phone out of your own account.
```bash
cd ~/Codes/Vromon/mobile
maestro test --device <serial> -e EMAIL=… -e PASSWORD=… -e FRIEND_CODE=… -e FRIEND_USERNAME=… -e FRIEND_TOKEN=… -e API_URL=http://127.0.0.1:8001 .maestro
```
`09-journey.yaml` runs the whole trip journey (a trip from today, rearranged, its conditions, Today mode) and deletes the trip at the end.

## Checks before calling something done

```bash
cd ~/Codes/Vromon/mobile && npm run typecheck && npx eslint . --max-warnings 0 && npm test && npx expo-doctor
cd ~/Codes/Vromon/backend && venv/bin/python -m pytest -q && venv/bin/alembic check
```

## When something goes wrong

| What you see | Fix |
|---|---|
| Red "Worklets version mismatch" screen | Stop Metro and start it again with `--clear` |
| "Cannot reach the server" | Backend not running, or redo `adb reverse tcp:8001 tcp:8001` |
| "Couldn't load your account" | Look at the backend terminal for the error |
| App can't connect to Metro | Redo `adb reverse tcp:8081 tcp:8081`, then reload |
| `adb devices` is empty | Unlock the phone, accept "Allow USB debugging", set USB mode to File transfer |
| `INSTALL_FAILED_ABORTED: User rejected permissions` (vivo, Xiaomi, OPPO, realme) | The phone asks "Install via USB?" on its own screen during every install: keep it unlocked and tap **Install**. On vivo also turn on Developer options → **Install via USB** and **USB debugging (Security settings)** (may need a vivo account and a SIM) |
| "There was a problem loading the project" / `Failed to connect to /127.0.0.1` | The cable was replugged: redo both `adb reverse` lines, then **Reload** |
| Today mode's location or reminder switch says it's off in settings | Allow location ("While using the app") or notifications for Vromon (Dev) in the phone's App info |
| `INSTALL_FAILED_NO_MATCHING_ABIS` | The quick build is 64-bit ARM only. Build without `-PreactNativeArchitectures=arm64-v8a` for older phones or the emulator |
| Two phones plugged in: `more than one device` | Add `-s <serial>` from `adb devices` to every adb command (install and both `reverse` lines) |
| Confirmation email doesn't arrive | Supabase's built-in mailer sends only a few per hour: wait, then "Resend email" |

## Configuration files (not committed)

- `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (secret), LLM keys
- `mobile/.env`: `EXPO_PUBLIC_API_URL=http://127.0.0.1:8001`, `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (publishable key only)
