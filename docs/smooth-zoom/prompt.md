# Smooth zoom between the map and the globe, as in Apple Maps

**Written:** 2026-11-21, against `extra-features` at `c49c943` (pushed).
**The owner asked:** "this map not like apple map when zoom out. there zoom in and out is smooth." Make zooming from the flat map out to the globe, and back in, feel like Apple Maps.
**Area:** the Map tab's map: `mobile/src/features/map/WorldMap.tsx`, `mobile/src/features/map/globe/`, and the other screen that uses `WorldMap` (Replay, `mobile/app/map/replay.tsx`).
**Status (2026-11-22):** the owner chose route A; it's built on the `smooth-zoom` branch. See [reports/route-a-report.md](reports/route-a-report.md). The rest of this file describes the code before that change.

## How to use this file

1. Paste the **Part 1** prompt into a new coding-agent session. It measures today's zoom on the phone, tries MapLibre's own globe in a spike, writes a report and **stops**.
2. Read the report and choose route **A** or **B** (below). Changing how the globe is drawn is your decision (D1 in `docs/ui-refresh`).
3. Paste the **Part 2** prompt with your choice filled in. It builds the route, checks it on the phone, writes its report, commits and stops. It never pushes.

## What Apple Maps does, and what Vromon does today

**Apple Maps has one model of the earth.** Up close it looks flat. As you zoom out, the same earth curves more and more until it's a globe floating in space. Nothing is swapped, so nothing can pop:
- one pinch goes from a street to the whole earth and back without lifting the fingers;
- a flick keeps zooming and eases to a stop;
- you can stop anywhere, a half-curved earth included.

Web map libraries work the same way: they draw a real sphere at every low zoom and blend it into the flat (Mercator) map only where the curve is too small to see (Mapbox GL JS does it between zoom 5 and 6).

**Vromon has two pictures and swaps them:**
- MapLibre draws the flat map (Mercator, vector tiles) from `zStart` up.
- A full-screen Skia canvas (`globe/Globe.tsx`) draws the curve and the globe. It uses a 4096 × 2048 picture of the world (`globe/texture.ts`) and a shader, plus its own country names and friends' markers.
- Between `zStart = zEnd + 1.5` and `zEnd`, the Skia picture bends from the flat map into an orthographic sphere (`globe/projection.ts`, "The zoom out"). On the owner's phone `zEnd` is 1.0 (clamped by `FLAT_MIN_ZOOM`) and `zStart` is 2.5.
- The camera has two owners. MapLibre's gestures move it while the flat map "leads"; the globe's own gestures (react-native-gesture-handler, `pan` and `pinch` in `Globe.tsx`) move it once the globe leads. `enterGlobe`, `release`, `leaveGlobe` and `onFlat` in `WorldMap.tsx` switch between them.

### Why it doesn't feel like Apple Maps

Found in the code and on the phone on 2026-11-20. Treat each as a lead to confirm with measurements, not a verdict.

1. **A pinch out hits a wall.** MapLibre's `minZoom` is `zEnd`, and the globe takes over only in `onRegionDidChange`. The RN wrapper sends that event when MapLibre's camera comes to rest, after the fingers lift. So a pinch out stops dead at the end of the curve; to make the globe smaller you lift and pinch again.
2. **A pinch in is driven from JavaScript.** Pinching in on the globe, the globe's own gesture keeps going past the curve. The flat map under it is moved from JavaScript with `camera.jumpTo` every frame (`jumpMap`, `FOLLOW_FROM`) until the fingers lift and `release()` hands back. That's a frame or more behind the fingers, with no MapLibre fling.
   - A late `jumpMap` once cut the home button's move short (fixed in `c49c943`). It's the kind of race this design invites.
3. **It snaps.** Letting go part way along the curve eases on to the nearer end: 380 ms in `onRegionDidChange` in `WorldMap.tsx`, 320 ms in `settle` in `Globe.tsx`. Apple Maps stays where you left it.
4. **The whole curve fits in 1.5 zoom levels** (`MORPH_ZOOMS`), right at the end of the zoom. In the earth button's 1.1 s flight from a city, frames captured 200 ms apart went from a flat map to the round globe between two frames. In Apple Maps the curve builds up over several zoom levels.
5. **The globe picture lags the map.** During the curve, Skia draws from `camLon`, `camLat` and `camZ`. `follow()` sets those from MapLibre's `onRegionIsChanging` events, so each update goes native → JavaScript → UI thread. That's at least a frame behind MapLibre, and more when JavaScript is busy.
6. **A canvas is created mid-gesture.** `Globe` mounts when the zoom drops below `zStart + 0.15` and unmounts above it (`draw()` in `follow()`). Every pass creates a full-screen Skia surface while the fingers are moving.
7. **Per-frame work on the UI thread.**
   - The names picture (`overlay` in `Globe.tsx`) is rebuilt every frame: 237 country names projected and checked for overlap.
   - The shader covers the whole 1260 × 2800 screen.
   - The wrapper sends React Native an event for every camera move (computing the visible bounds each time) and for every rendered frame.

   Measure before blaming any of them.
8. **The two pictures differ at the hand-over.**
   - Sharpness: at zoom 2.5 the screen shows about 31 px per degree, but the 4096 px picture has about 11, so the globe side is visibly softer.
   - Names: MapLibre's names give way to Skia's, in another font and position. Since `c49c943` Skia's names fade out before the cross-fade, so they no longer double, but the change is still there.
9. **Two motion feels.**
   - Flat-map moves use MapLibre's easing and fling.
   - Globe moves use Reanimated `withTiming` (cubic, 320–700 ms).
   - The globe's pinch has no momentum at all; its drag does (`withDecay`).
10. **Size:** on this phone the clamp makes the resting globe about 7 dp wider than `restingView` means, so it nearly touches the screen edges.

### MapLibre's own globe (new, pre-release)

- **The installed library has no globe.**
  - The app uses MapLibre Native for Android 13.6.1, through `@maplibre/maplibre-react-native` 11.5.0; its compiled code contains no globe.
  - No stable release has the globe yet, as far as the pages below say (the October newsletter names 13.7.1 as the latest stable).
  - That's why step 1 of `docs/ui-refresh` drew our own, under decision D1: "own globe; Skia or better; no API call" (`docs/ui-refresh/reports/step-0-report.md`).
- **Since October 2026 MapLibre publishes globe pre-releases:**
  - GitHub tags [`android-v2026.10.19-globe`](https://github.com/maplibre/maplibre-native/releases/tag/android-v2026.10.19-globe) and [`android-v2026.11.2-globe`](https://github.com/maplibre/maplibre-native/releases/tag/android-v2026.11.2-globe); there are iOS ones too.
  - They come from the still-open [PR #4533](https://github.com/maplibre/maplibre-native/issues/4533), "render the map as a globe when the style sets projection" ([October newsletter](https://maplibre.org/news/2026-11-03-maplibre-newsletter-october-2026/)).
  - A style turns the globe on with `"projection": {"type": "globe"}`. Android also gets `Projection#isLocationOccluded`.
  - Known from the PR's description: labels vanish in the frame their anchor crosses the horizon; the library grows by about 5 MB.
  - **Not confirmed** (read from summaries of those pages on 2026-11-21):
    - the Maven coordinates (possibly `org.maplibre.gl:android-sdk-opengl:2026.11.2-globe`, or only `.aar` files on the release);
    - tile seams reported on Android between zoom 6 and 10, and a fix being worked on;
    - whether the globe blends smoothly into Mercator when zooming in;
    - whether the RN wrapper's 13.x code builds against it.
- **It would still draw countries from our own data.** The country shapes and names are bundled GeoJSON sources (`layers.tsx`), and they'd be drawn on MapLibre's globe as well.
- **The spike is small.**
  - `MAP_STYLE` in `style.ts` is a bare style object (the layers come as children), so turning the globe on is one property there.
  - The native version is the other half. The wrapper reads `org.maplibre.reactnative.nativeVersion` and `nativeVariant` from Gradle properties (`getConfigurableExtOrDefault` in its `android/build.gradle`).
  - `android/` is generated (Expo CNG), so set them with a config plugin in `mobile/plugins/` (`withDevCleartext.js` is one), never by editing `android/`.

## The two routes

**A. MapLibre draws the globe (one renderer).** Turn on the pre-release's globe and remove the Skia globe and the hand-over.
- **Gains:** MapLibre owns every gesture at every zoom, so leads 1–6 and 9 go away by themselves. The map stays sharp, names stay MapLibre's, and taps work as on the flat map.
- **Risks:**
  - a pre-release library in the dev app and the friends' APK;
  - unknown look and speed on this phone;
  - the design's sky colour, rim glow and shadow need MapLibre's own (`sky`, light) or a thin overlay.

**B. Keep our Skia globe and fix how it's driven.** If A is out, the shape to aim for:
- One gesture owner for the whole zoom range: MapLibre, with `minZoom` lowered to the globe's smallest size.
- The Skia picture becomes a view of MapLibre's camera, with `pointerEvents="none"`. Taps on the globe go through MapLibre's `onPress` and our `unproject`.
- Camera events are handled on the UI thread (Reanimated, not React state or the JavaScript thread), so the picture moves in the same frame as the map.
- The canvas is mounted once and kept; the names picture is cached between frames; no snapping.
- The curve is spread over more zoom levels.

What B can't fix: the picture is softer than the tiles, and softer still the further in the curve starts (lead 8). The names still change at the hand-over.

## Part 1 prompt

```text
Start part 1 of docs/smooth-zoom/prompt.md: measure today's zoom, try MapLibre's own globe, and
recommend a route. Read that file first, all of it, then mobile/AGENTS.md and
docs/running-locally.md.

Work on a new branch, smooth-zoom, from extra-features (c49c943). Leave the owner's uncommitted
files alone: data/geo/*.json, docs/UI_IMPLEMENTATION_GUIDELINES.md, data-platform/quality-reports/.

1. The bar. "Like Apple Maps" means, on the owner's phone:
   - one pinch, without lifting, from a city-level view out to the whole globe and back in;
   - nothing pops: no jump in place or size, no visible cross-fade, no names jumping or doubling,
     no change in sharpness;
   - the place under the fingers stays under them, on the flat map and on the globe;
   - a flick keeps zooming and eases to a stop, the same on both; the globe turns with momentum;
   - lifting the fingers part way leaves the view where it is;
   - 120 frames a second (8.3 ms a frame) during a pinch, a flick, the earth button and the home
     button;
   - everything else keeps working: a tap on a country on the globe opens its sheet, press and
     hold opens the quick mark, friends' markers, names on the facing side only, the map theme's
     colours in light and dark, reduce motion, the globe hint, the earth and home buttons, the
     Replay screen's map (app/map/replay.tsx).

2. Measure today, before changing anything. For a pinch out from a city to the globe, a pinch in,
   a flick, the earth button, the home button and a double-tap on the globe:
   - count the frames over budget and find the worst one (Perfetto FrameTimeline; the map is its
     own surface, so make sure it's counted);
   - note what the eye sees (screen recording or frame captures, see "Testing on the owner's
     phone" in the prompt file).
   Confirm or rule out each lead in "Why it doesn't feel like Apple Maps", and add any it missed.

3. Spike route A, time-boxed to about half a day.
   - Find how the newest MapLibre globe pre-release for Android is published: GitHub release
     assets or Maven. Read the release pages and PR #4533.
   - Build the dev app with it: set the native version through a config plugin in
     mobile/plugins/, add "projection": {"type": "globe"} to MAP_STYLE, and turn our Skia globe off
     with a temporary flag (don't delete it).
   - Check every point of the bar on the phone and measure as in 2.
   - Note what breaks: whether the RN wrapper 11.5.0 builds and runs with it; the layers (fills,
     outlines, names, the friends' layers, the trip and today layers); taps and long presses;
     WorldMap's world/home/fit/show/focus moves; how the globe hands over to the flat map when
     zooming in; the sky colour; APK size, cold start and memory.
   - If it can't be built within the time-box, say what stopped it.

4. Route B on paper: from the measurements, which points of the bar B can meet, what it would take
   (see "The two routes"), and what it can't meet.

5. Write docs/smooth-zoom/reports/part-1-report.md:
   - your recommendation, A or B, in one line at the top;
   - the numbers for today (and for A), and what you saw;
   - what broke in the spike;
   - the risks: a pre-release library in the friends' APK, and how we'd move to a stable release
     once MapLibre ships one.
   Commit the report, this prompt file if it isn't committed yet, and the spike behind its flag, on
   the smooth-zoom branch. Then STOP and ask the owner to choose A or B. Replacing our own globe
   (D1) is the owner's decision.
```

## Part 2 prompt

Replace `<A or B>` with your choice before pasting.

```text
Start part 2 of docs/smooth-zoom/prompt.md: build route <A or B>, which the owner chose after
part 1. First read docs/smooth-zoom/prompt.md, docs/smooth-zoom/reports/part-1-report.md,
mobile/AGENTS.md and docs/running-locally.md. Continue on the smooth-zoom branch.

1. Build the chosen route so that part 1's bar is met on the owner's phone. Where a point can't be
   met, say why in the report.
   - Route A: make the spike real.
     - Remove the Skia globe, the hand-over (leading, enterGlobe, release, leaveGlobe, settle,
       jumpMap) and any code nothing uses any more.
     - Keep the look (sky colour, glow) as close as MapLibre allows.
     - Keep WorldMap's world/home/fit/show/focus moves working.
   - Route B: remove the spike's flag and code, then build:
     - one gesture owner for the whole zoom range;
     - the picture driven on the UI thread;
     - the canvas mounted once;
     - no snapping;
     - the curve spread over more zoom levels (tune it on the phone);
     - the names picture cached.
   - Both routes:
     - the same momentum and easing on the flat map and the globe;
     - reduce motion still turns motion off;
     - light and dark themes, and the Replay map, still work.
2. Tests: keep src/__tests__/globe.test.ts meaningful. Update the maths it checks, or remove tests
   for code that's gone and add tests for what replaced it. Run the full Jest suite,
   npx tsc --noEmit and npx expo lint.
3. On the phone: check the whole bar from part 1, measured the same way, with before and after
   numbers in the report. Two-finger pinches can't be injected on this phone, so ask the owner to
   do them and record the screen meanwhile.
4. Write docs/smooth-zoom/reports/part-2-report.md: what changed, the numbers, and what the owner
   should try on the phone. Commit, then stop.
   - Don't push.
   - Don't rebuild the friends' APK unless the owner asks (docs/sharing-with-friends.md says how).
```

## Testing on the owner's phone

**The phone and the app**
- The phone is a vivo V2425A: Snapdragon 8 Gen 3, Android 16, 120 Hz.
- The screen is 1260 × 2800 with a density override of 616, so about 327 dp wide.
- The dev app is `com.vromon.app.dev`.
- adb is at `C:\Users\mdsul\AppData\Local\Android\Sdk\platform-tools\adb.exe`. In Git Bash, run `export MSYS_NO_PATHCONV=1` first, or `/sdcard/...` paths get rewritten.

**Running the app**
- **Metro:** `npx expo start --dev-client --port 8081`, **without** `CI=1`. CI mode turns reloads off, so edits never reach the phone. JavaScript logs show in Metro's output, not reliably in logcat.
- **Opening the app on Metro:** `adb reverse tcp:8081 tcp:8081`, then `adb shell am start -a android.intent.action.VIEW -d "exp+vromon://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" com.vromon.app.dev`.
- **Backend:** see `docs/running-locally.md` (port 8001).
- **The owner's account:** the phone is signed in to it. Check through the read-only proxy: `scripts/dev/readonly_proxy.py` listens on 8011, then `adb reverse tcp:8001 tcp:8011` (details in `docs/friends-chat-plan.md`). Don't mark or change anything.
- **Installing a new dev build** (`npx expo run:android`, needed after any native change): vivo asks on the phone before installing, and the owner has to tap Install. An install that hangs is waiting there.

**While you test**
- **The owner uses the phone while you work** (calls, WhatsApp). Before every tap or gesture, check `adb shell dumpsys window | grep mCurrentFocus`. If it isn't Vromon or the launcher, stop and wait.
- **Gestures you can inject:** `input tap`, `input swipe` and `input motionevent DOWN/MOVE/UP`, all one-finger.
  - MapLibre's one-finger zoom works: tap, then press again and drag up to zoom out or down to zoom in.
  - Two-finger pinches can't be injected: SELinux blocks `sendevent` to `/dev/input`. Our Skia globe has no one-finger zoom.
- **Seeing motion:**
  - A loop of raw `screencap` to /sdcard gives a frame about every 200 ms. That's too coarse for smoothness but fine for "what happened". Delete the files afterwards.
  - For smoothness use Perfetto's FrameTimeline, or `adb shell screenrecord`. Reading a recording's frames needs ffmpeg; ask the owner before installing it.

**The PC**
- **Disk:** C: is nearly full. Keep temp files and caches on E: (`TMP` and `TEMP` set to `E:\vromon-tmp`). Gradle's home is already `E:\.gradle`.
- **After a friends' APK build:** `expo prebuild --clean` with `APP_VARIANT=preview` regenerates `android/`. Switching back to the dev app regenerates it again, so the next dev build is a full one, about 15 minutes.

## Rules

- Expo has changed since your training data: use the versioned docs (`mobile/AGENTS.md`). Add libraries with `npx expo install`. Never edit `android/` by hand.
- Don't start the UI plan in `docs/UI_IMPLEMENTATION_GUIDELINES.md`; the owner has put it on hold.
- Commit each part when it's finished and checked, with `Co-authored-by: alifalahad <alifalahadxi@gmail.com>` as the only trailer (no Claude co-author line). Never push.
- Stop after each part. Ask the owner whenever a decision is theirs: replacing our own globe (D1), shipping a pre-release library, rebuilding the friends' APK.
