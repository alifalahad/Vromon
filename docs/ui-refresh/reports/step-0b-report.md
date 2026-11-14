# Step 0b report: the look's foundations

**Date:** 2026-11-14. **Status:** done. **Mockups:** frames 1, 15, 20 and 21 of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

The approved colours, the title font, the shapes and the tab bar are now in the app's theme. Every screen takes them from there, so the whole app changed at once. Layouts are unchanged; the later steps change those.

## 1. What changed

### Colours (`mobile/src/ui/theme/tokens.ts`)

- Light and dark take the values in "The look": the cool grey ground, white cards, navy text, one blue for actions. Dark becomes navy instead of neutral grey.
- The token names are kept. Five new tokens:
  - `hero` and `onHero`: the dark card a screen leads with;
  - `onHeroSecondary`: second lines on that card;
  - `highlight`: marigold;
  - `accentTint`: the solid blue tint, for the selected tab and quiet blue buttons.
- **One shade moved from the frames:**

  | Token | The look | Now | Why |
  |---|---|---|---|
  | `success`, light | `#157F4B` | `#137A48` | The look's green is 4.45:1 on the inset grey; AA needs 4.5. |

  The other new values are the frames' own. Warning text in light is the frames' `#8A5300` (it was `#A74D08`).

- **Dark accent:** white on the old dark blue was an allowed exception at 4.06:1. White on the new `#2F6BE6` is 4.81:1, so the exception is gone and the test now asks for 4.5 in both appearances.
- `contrast.test.ts` gained checks for the hero card (white, second lines, marigold), blue text on the blue tint, the off switch's track on cards and on the ground (3:1), and the snackbar's text and action.
- `tokens.test.ts` now pins the approved values instead of the old sampled ones.

### The title font

- **The font:** Anek Bangla Bold (SIL Open Font License 1.1), from `@expo-google-fonts/anek-bangla`, installed with `npx expo install`.
- **How it loads:** the file is bundled with the app, so no network is needed. `app/_layout.tsx` loads it with `useFonts` before the splash screen goes. If it can't be read, the app opens anyway and titles use the phone's font.
- **Why not the config plugin:** the Expo docs prefer the `expo-font` config plugin, which needs a native rebuild. Loading from the bundle gives the same result without one: the dev app and the friends' APK keep working as they are. Moving to the plugin can come with the next native rebuild (step 1 adds Skia).
- **Where it's used:**
  - one token, `fonts.title`;
  - `type.largeTitle` (tab titles, 32), a new `type.screenTitle` (24, every pushed screen's header), `type.title` (22) and a new `type.hero` (44);
  - 18 large numbers and titles that screens set by hand now take the same font: the next-trip card, the trip's name, Today's "Leave by", budget totals, the stats screen's numbers, Replay's year, among others.
- **Found on the phone:** the font file is already bold. On Android, asking a font loaded at run time for `fontWeight: '700'` falls back to the phone's font. Title styles therefore keep the weight at `normal`; a comment in `tokens.ts` says so. One subtitle that used the title style only for its size (a district's division line) now sets its size itself, so it stays in the phone's font.
- **Licences:** the font's licence line was added to the app's licences text (`map.attribution`) in English and Bangla.

### Shapes and depth

- **Corners:** cards 22 (was 24), sheets and the new `radius.hero` 28 (was 24), controls 16 (was 12).
- **Buttons:**
  - a new `sizes.button` (52) is used by `Button`'s main button;
  - the secondary button is now the blue tint, not white, so it shows on a white card as well as on the grey ground;
  - every non-danger button text is the blue that passes on that tint.
- **Depth:** a new `depth` token holds the two shadows in "The look": cards barely lift, things over the map lift clearly. `Fab` uses it.

### The tab bar (`mobile/app/(tabs)/_layout.tsx`, frame 1)

- The selected tab's icon sits on a blue-tint pill (56 × 30), and its label is bold.
- Icons are 24, labels 12.5. A hairline separates the bar from the screen.
- The labels keep today's rule: they grow up to 1.25×.

### The Default map (D13)

- **Default** now has light-blue water and pale land (the colours of the old "Default" map style), with the same orange marks. In dark it is the navy of frame 20 (land `#1E2A3B`, water `#0B1220`); the Default map style's dark colours are the same.
- **Classic** is today's grey map, kept as a free theme, last in the list.
- **Saved themes:** themes are saved by name. Someone who had Default keeps Default and so gets the new colours; a saved Classic loads. Tests check both.
- **The Map sheet** shows the first four themes as before; Classic is under "All themes".
- **Thumbnails:** they were rebuilt with `scripts/map-themes/build.py`. Only the Default style's dark thumbnail changed.

### Colours written by hand

These had to move with the palette:

- **Snackbar:** its action used fixed blues. It now uses the other appearance's link colour, because the bar is the inverse colour.
- **Four sheets** (stop, add a stop, place picker, the day's free-time rows): a hand-written light grey became the ground token.
- **Map lines:** the trip-trail and Today lines' light blue (`#2563D9`) became the new blue.

## 2. How it was checked

**Before changing anything:** typecheck and lint were clean. Jest: 656 of 657 passed. The one failure was `mustDosAdd.test.tsx`, which timed out at 5 s while three checks ran at once; it passes on its own and in the full runs after.

**After:** typecheck clean, lint clean (`--max-warnings 0`), and the full Jest run after the last change. The final counts are in section 4.

**On the phone** (the realme, test account A, the debug dev app with Metro):

| Checked | Result |
|---|---|
| Map, Explore, Trips, Friends tabs; Settings; Appearance sheet, in dark | Navy ground and cards, blue pill under the selected tab, titles in Anek Bangla. |
| Settings, Map, Trips, a trip (both sheet heights), New trip, Friends and a trip-room chat, in light | Cool grey ground, white cards, navy text; the chat's sent card is the blue tint. |
| Map Theme | Default shows the light-blue map with orange marks; Classic is in the list. Nothing applied. |
| Bangla | Settings, Trips and a trip: Bangla titles and Bangla digits in the new font, nothing cut. |
| Largest text (1.6×) | Map, Trips, a trip: titles wrap rather than cut. The tab labels stop at 1.25× as before. |

Afterwards the test account was set back to English and System appearance, and the text size to 1.0.

**Maestro and the release build:** see section 4.

## 3. Left open

- **Screens not opened on the phone:** "Your story", Today, Budget, Conditions, the stats screen, Replay, the poster. They take the same tokens, and each is redrawn by a later step.
- **The orange cards** (`cards.ts`: the next trip, Today's "Now") stay until steps 9, 15 and 20. They still pass contrast on the new ground (5.1:1).
- **Not the look's colours:** the trip plan's meal and stay colours, Good and Bad, and the person colours. They have their own tests and come with steps 14 and 16.
- **Seen, already in later steps:**
  - "+ Plan a trip" still covers "All trip stats" (step 9);
  - during a trip the plan sheet's header wraps at 1.6× (step 14).
- **The font through the config plugin** (see section 1): when a step next rebuilds the native app.

## 4. Checks at the end

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` (whole suite) | 664 of 669 passed while the release build was compiling. The 5 others were 5-second timeouts in `navigation`, `searchAnything` and `tripLegs`; run again once the build had finished, those three files passed, 24 of 24. 669 tests in all (657 before this step, 12 new). |
| Maestro `03-theme-rustic`, `10-map-home` | both passed on the phone, launching the dev app directly (`-e DEV_CLIENT=false`). With the default launch, Android asks which Vromon app should open the link, because the friends' preview app answers it too, and both flows stop there. |
| Release build of the dev app (`assembleRelease`, arm64) | built (21 min, with the bundle folders cleared first because the strings changed). On the phone: the title font, the tab pill and the colours are as in the debug build. The trip screen was opened 8 times; its plan sheet was drawn all 8 times. |

The backend isn't touched by this step, so its tests weren't run.

**On the phone afterwards:** the debug dev app (Metro) is back on the phone, signed in as test account A, set to English, System appearance and text size 1.0. Flow 10 marks Dhaka "want to visit" on test account A, as it always does. The backend and Metro were restarted during the step (the Mac had restarted) and are running.

## Files

- `mobile/src/ui/theme/tokens.ts`, `mobile/app/_layout.tsx`, `mobile/app/(tabs)/_layout.tsx`
- `mobile/src/ui/Button.tsx`, `Fab.tsx`, `Snackbar.tsx`
- `mobile/src/features/mapThemes/catalog.ts`, `assets.generated.ts`, `mobile/assets/map/styles/default-dark.png`, `mobile/src/features/map/MapSheet.tsx`
- 18 screens and components that set a title's or a large number's font by hand, and the four sheets with a hand-written grey
- `mobile/src/i18n/en.json`, `bn.json` (the font's licence)
- `mobile/package.json`, `package-lock.json` (`@expo-google-fonts/anek-bangla`)
- Tests: `contrast.test.ts`, `tokens.test.ts`, `mapThemes.test.ts`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.
