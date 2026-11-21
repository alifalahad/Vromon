# Smooth zoom, route A: MapLibre draws the globe

**Date:** 2026-11-22. **Branch:** `smooth-zoom` (from `extra-features` at `c49c943`). **Status:** built and checked on the owner's phone; not pushed; the friends' APK is not rebuilt.

The owner chose route A on 2026-11-21, before part 1's report, so part 1 (measure, spike) and part 2 (build) ran as one piece.

## What changed

- **MapLibre's own globe.**
  - The app uses MapLibre Native for Android `2026.11.2-globe` (a pre-release from Maven Central) instead of 13.6.1, set through the RN wrapper's own Expo plugin in `mobile/app.config.ts`. The RN wrapper (11.5.0) builds and runs against it unchanged.
  - `MAP_STYLE` (`style.ts`) asks for `"projection": {"type": "globe"}`. One map draws every zoom and curves into the globe as you zoom out; there's no second picture and no hand-over.
- **`WorldMap.tsx` lost the hand-over.**
  - Gone: the Skia globe, `leading`/`enterGlobe`/`release`/`leaveGlobe`/`onFlat`/`jumpMap`, the settle to the nearer end, and the shared camera values.
  - MapLibre's gestures, fling, double-tap and taps work at every zoom.
  - The earth button eases to `globeRestZoom` (`globe/projection.ts`) facing home; the home button and the other moves are plain camera moves.
  - The hint shows below zoom 2 until the first touch there.
- **The friends' markers on the globe** are now the friends' MapLibre layers (`FriendLayers`), which have no zoom limit, so the Map tab no longer passes `globeFriends`.
- **Every map is a TextureView on Android.** With the pre-release, MapLibre's default GLSurfaceView stays black after a screen that covered it closes (open "Your travels", go back: a black map until it's touched). `WorldMap` now defaults to `androidView="texture"`. The other maps on screens (trip plan, place picker, theme preview, friend comparison, Replay) already used it.
- **Removed as unused:**
  - the interactive globe and its morph maths (`projection.ts` keeps the resting size and the still globe's tilt);
  - `globe/countryAt.ts` (MapLibre finds the tapped country now);
  - the `map.globeLabel` string.

  `GlobeImage` (the still globe on "Your travels" and Explore) stays, with its shader cut down to the sphere it always drew.

## Numbers (owner's phone, vivo V2425A, the display ran at 90 Hz: 11.1 ms a frame)

SurfaceFlinger TimeStats, present-to-present, during each move. Before, the map was MapLibre's surface and the globe was drawn by Skia in the app's window; the table counts the layer you see.

| | Before (our Skia globe) | After (MapLibre's globe) |
|---|---|---|
| Earth button, from home (2 runs) | 14–16 late frames, worst 22 ms and 122 ms | 0–1 late, worst 22 ms |
| Home button, from the globe (2 runs) | 2–3 late, worst 58–66 ms | 0 late |
| One-finger zoom out into the globe | 11 late, worst 200 ms (≈45 frames lost) | 1 late, worst 33–58 ms |
| One-finger zoom in from the globe | not possible (the globe had no one-finger zoom) | 1–2 late, worst 44 ms |
| Turning the globe | — | 0–1 late, worst 22 ms |

The one-finger zooms were injected with `adb input motionevent`, about 100 ms between moves, so their single late frame is likely the injection, not the map.

## Checked on the phone

- **Zooming out:** the earth button flies out from the home view; the flat map curves into the globe and settles facing Bangladesh (frames captured 200 ms apart showed no jump or swap).
- **Zooming in and out by gesture:** one-finger zoom works in and out across the whole range, and stops anywhere.
- **On the globe:** a drag turns it; a tap on a country opens its sheet (Nepal); press and hold opens the quick mark (Russia; nothing was marked).
- **Buttons:** the home button flies back in.
- **Hint:** shows on the globe and goes away on the first touch.
- **Leaving and coming back:** "Your travels" and back, and the app sent home and reopened, both keep the map drawn.
- **Other screens:** Replay opens and closes cleanly; the trip plan's map draws.

**Not checked:**
- a real two-finger pinch (it can't be injected on this phone: the owner should try it);
- the light theme;
- reduced motion.

## Open points for the owner

- **A pre-release library.** `2026.11.2-globe` comes from an open pull request ([#4533](https://github.com/maplibre/maplibre-native/issues/4533)). The dev app has it now; the friends' APK only gets it if rebuilt. When a stable MapLibre release has the globe, change `nativeVersion` in `app.config.ts` (or drop it once the RN wrapper's default has the globe).
- **Space is black, with no glow.**
  - The library has no `sky` or atmosphere yet, so around the globe it's black.
  - In the dark theme that's close to the design's `#070C15`.
  - In the light theme the design had a pale sky (`#E9F1FA`) and a white rim glow; it will be black space there too (as in Apple Maps' globe).
- **Names vanish** the moment they cross the globe's edge (the library's own behaviour, noted in the pull request).
- **The phone ran at 90 Hz**, not 120, in every measurement (the system's choice for this app).

## How it was measured

`dumpsys SurfaceFlinger --timestats -enable -clear`, the move, then `--timestats -dump`. Read the `present2present` histogram of the app's layers (the map's own SurfaceView layer, before; the app window, after). `--latency <layer>` returns nothing on Android 16.
