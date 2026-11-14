# Step 1 report: the globe

**Date:** 2026-11-14. **Status:** done, except the friends' APK (section 5). **Mockup:** frame 2 of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

Zoomed out past the world, the Map tab now shows the earth as a globe. A finger turns it in any direction. Pinching in, or a double tap, brings back the flat map at that place. Nothing is fetched: it is drawn on the phone from the country shapes bundled in the app.

## 1. How it's drawn, and why Skia

**Chosen:** `@shopify/react-native-skia` 2.6.2, the version Expo 57 pins, added with `npx expo install`. It is native code, so the dev app was rebuilt (D1 allows that).

**How it works:**

- **The world picture:** drawn once on the phone as a flat picture (4096 × 2048, longitude across, latitude down) from the bundled countries, in the map theme's colours. Marked countries are in their status colours, by the flat map's zoomed-out rule (`withImpliedCountries`). It is drawn again only when a mark or the theme changes.
- **The sphere:** a small shader wraps that picture onto a sphere, pixel by pixel. Turning the globe costs the same however detailed the shapes are. The light from the upper left, the darker rim, the glow around the edge and the smooth edge all come from that shader.
- **Names and friends' markers:** drawn over it each frame on the UI thread, at their projected points, on the facing side only. A name is left out when it would overlap another or not fit inside the outline.

**The other option I looked at:**
- **A 3D view** (`expo-gl` with three.js). It needs a WebGL scene, a sphere mesh, its own camera and its own hit testing for taps. The picture would be the same, with much more code.
- **Skia's way** is one picture, one shader and plain maths for taps. It also works with the gesture and animation libraries the app already uses.

**No fallback needed:** the shader route worked on the phone the first time, so the planned fallback (redrawing paths every frame) was not built.

The Skia docs site was down during the step; I read the installed package's own type definitions instead.

## 2. What it does

| | |
|---|---|
| **Opening the globe** | Pinching the flat map out below zoom 1.25 opens the globe, facing where the map was, with a 260 ms cross-fade (none with reduced motion). The flat map can no longer go further out than zoom 1.0, where the world is still wider than the screen, so no black edge shows at any zoom (screenshot 9). |
| **Turning** | A drag turns it on both axes, with momentum; the tilt stops about 80° short of the poles. |
| **Zooming in** | Pinching resizes it. At 1.6 times its size at rest it hands back to the flat map at zoom 2.1, at the place under the fingers. **A double tap does the same** at the place tapped: a way in without pinching. I added it because the phone can't be pinched from the Mac (section 3); Google Earth does the same. |
| **Colours** | The active map theme's land, water and borders. Marked countries in their status colours; "Want to visit" outlined in the preset themes, as on the flat map. Light and dark each have their own sky behind the globe and glow at its rim: three new tokens, `globeSky`, `globeGlow`, `globeShadow`. |
| **Names** | English, as on the flat map. Bigger countries first, more as the globe grows (Natural Earth's label zoom, like the flat map), facing side only. |
| **Tap / press and hold** | A tap on a country opens its place sheet; press and hold opens the quick mark, as on the flat map. |
| **Buttons** | The earth button shows the globe turned to the home country. The home button and a second tap on the Map tab go home, closing the globe. |
| **Friends** | With the Friends layer on, friends' country markers (initials, "+N") are drawn on the globe too; a tap on one opens that country's sheet. Region markers are left out: too small to see on the globe. |
| **Poster** | Still taken from the flat map at home: "home" closes the globe first. |
| **The hint** | "Drag to turn the globe. Pinch or double-tap to zoom in." (frame 2), until the first drag or pinch. |
| **Screen readers** | The globe is one image with a label that says how to use it and that a place can be added with "+". Marking without gestures stays possible through "+" (Add a place). |

**Not in frame 2's top-left button:** the "3 countries · 1.5% of the world · 2 continents" button is step 2's. Today's capsule shows instead.

## 3. How it was checked

**Phone** (the realme, test account A, debug dev app with Metro):

| Checked | Result |
|---|---|
| Earth button | The globe opens turned to Bangladesh, in the Rustic theme (dark) and the Default theme (light: it looks like frame 2). |
| Drag sideways, drag down | Turns east–west and tilts north, with momentum; the hint goes away. |
| Tap Greenland | Its place sheet opens. |
| Press and hold on Russia | The quick mark opens for Russia (closed without marking). |
| Double tap on Bangladesh | The flat map at zoom 2.1 around Bangladesh. |
| Flat map zoomed out (MapLibre's one-finger quick zoom: double tap, hold, drag up) | The globe opens, facing where the map was. |
| **Hand-over 10 times each way** | Globe to flat map 10 of 10; flat map to globe 10 of 10 (checked from what a screen reader sees after each). |
| Themes | Rustic, Default and Midnight, in dark; Default in light. |
| Bangla, largest text (1.6×) | The hint in Bangla wraps to three lines and stays clear of the globe; names stay English. |

The test account was put back to English, System appearance, normal text size and the Rustic theme it had.

**Not done on the phone:**
- **Pinching.** `adb` can only send one finger (`input`), and the phone refuses raw touch events from adb (`sendevent`: permission denied). The pinch code shares its hand-over with the double tap, which was checked, and the zoom-out side was checked with the one-finger quick zoom. **Please pinch it yourself** (section 6).
- **Flight mode.** I don't switch your phone's radios. The globe makes no network request at all: the shapes and the font come from the app and the phone.

**Tests:** see section 4.

## 4. Checks at the end

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` (whole suite) | 680 of 681 passed. The 12 new globe tests all pass. The one failure was in `chatCache.test.ts` (a chat test this step doesn't touch, expecting 100 messages and getting 50); run on its own it passed, 12 of 12. |
| Maestro `03-theme-rustic`, `10-map-home` | both passed on the phone. Flow 10 taps the earth button twice: globe, then home, which still frames Bangladesh. |
| Release build of the dev app | built and installed. The bundle has the globe's strings and the Skia library. On the phone: turning the globe eight times gave 475 frames, half within 16 ms and 95% within 19 ms, 2% janky. Hand-over 10 of 10 each way, as on the debug build. |

The backend isn't touched by this step, so its tests weren't run.

**On the phone afterwards:** the new debug dev app (with Skia) is installed; Metro is running with a clean cache. Test account A is set to English, System appearance, normal text size, the Rustic theme. Flow 10 marks Dhaka "want to visit" on test account A, as it always does.

## 5. The friends' APK

Not rebuilt yet: the step says to ask you first. Skia is native code, so friends need a new APK to see the globe. Until then their app keeps working as it is, because the JavaScript they load comes from the APK itself.

## 6. Left open

- **Pinch on the globe:** for you to try (above).
- **Tuning that may need your eye:** the hand-over points (zoom 1.25 out, 1.6 times bigger in), the momentum, and how many names show.
- **Labels in Bangla:** names on the globe are English, as on the flat map. Skia could draw Bangla with its paragraph API; say if you want it.
- **Region-level friend markers** are not on the globe (above).
- **Skia warnings:** its old path calls were replaced by the new path builder, so Metro shows no Skia warnings.

## Files

- New: `mobile/src/features/map/globe/Globe.tsx`, `projection.ts`, `countryAt.ts`, `texture.ts`; `mobile/src/__tests__/globe.test.ts`
- `mobile/src/features/map/WorldMap.tsx` (the globe over the flat map, the hand-overs, the earth button, the flat map's zoom limit), `mobile/app/(tabs)/index.tsx` (friends' markers for the globe)
- `mobile/src/ui/theme/tokens.ts` (`globeSky`, `globeGlow`, `globeShadow`)
- `mobile/src/i18n/en.json`, `bn.json` (`map.globeHint`, `map.globeLabel`)
- `mobile/jest.setup.js` (a stand-in for Skia: no test draws the globe)
- `mobile/package.json`, `package-lock.json` (`@shopify/react-native-skia`)
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.
