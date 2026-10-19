# Trip Planner Design Spec

**Status:** draft from step 1; becomes final when the mockups are approved
**Mockups:** https://claude.ai/artifact/LQuSxSaKiQ8SAiZkHk6Wzf (sources in `docs/trip-planner/mockups/`)
**Uses:** the existing tokens in `mobile/src/ui/theme/tokens.ts`. Nothing here replaces them; new values are listed in §1.

## 1. Colour

### Existing tokens

All trip screens use the existing tokens: `bg`, `surface`, `surfaceInset`, `accent`, `accentSoft`, `link`, `text*`, `success`, `warning` and `danger`.

### New tokens

Tokens with the same name in both columns are new. `ribbonVisit` and `ribbonMeal` reuse an existing value; the last three rows are map paint.

| Token | Dark | Light | Used for |
|---|---|---|---|
| `tripSunset` | `#B5501A` | `#B5501A` | Next-trip card, Today "Now" card. White text on it is 4.8:1. |
| `tripSunsetText` | `#F08A4B` | `#B5501A` | Sunset icon or text on a neutral background |
| `ribbonVisit` | `link` (`#6EA0F6`) | `accent` (`#2563D9`) | Visits in the day ribbon, visit pins |
| `ribbonMeal` | `warning` (`#F2B13C`) | `#E39A2D` | Meals in the ribbon, meal pins. Dark `#1F1F1F` number on top. |
| `ribbonTravel` | `textTertiary` hatching | `textTertiary` hatching | Travel time in the ribbon |
| `cardRaised` | `surface` (`#333333`) | `#F3F3F5` | Stop cards inside the sheet. In dark mode the sheet is `bg` (`#262626`); in light mode it is `surface`. A lighter dark card (`#3D3D3D`) was tried and failed AA for link (4.15:1) and tertiary (3.96:1) text. |
| map `sea`, `land`, `park` | `#1B2733`, `#2C2C2C`, `#2D3A2B` | `#CFE2F0`, `#F1EEE8`, `#DCEAD2` | Only for mockups; the real map uses the MapLibre styles |

### Meaning

- **Blue** means "you can tap this" (buttons, links, selected tabs).
- **Sunset orange** is the trip's identity colour. It is not used for buttons.
- **Amber** marks meals and "slow" traffic.
- **Red** marks warnings that affect a stop.
- **Green** marks "clear" and "done".
- Colour is never the only signal: traffic dots always have a word next to them, and warnings have an icon and text.

## 2. Type

- **Font:** the system font (Roboto on Android); Noto Sans Bengali for Bangla.
- **Sizes:** as `type` in tokens. On top of that:
  - the screen title in the sheet is 24/700;
  - "Leave by" is 40/800;
  - budget totals are 34/800.
- **Times** are in 24-hour format ("15:45") in both languages; Bangla uses Bangla digits (১৫:৪৫), as the stats card already does.

## 3. Components

| Component | Spec |
|---|---|
| **Trip sheet** | `@gorhom/bottom-sheet`, top radius 24, handle 40×5. Snap points: about 50% (map and plan) and 92% (plan only). |
| **Day tabs** | 3 equal pills, 50 dp tall, radius 14. Day number (15/700) over the date (12). The selected tab uses the `accent` fill. More than 3 days: horizontal scroll. |
| **Day ribbon** | A 14 dp bar, radius 7, covering 07:00–21:00 to scale. Above it, a 14 dp weather lane (danger-tinted blocks for storms). Below it, 11 dp hour labels every 3 h. Tap scrolls to that stop. |
| **Conditions strip** | 36 dp chips, scrolling horizontally: temperature, warnings count (danger tint), sunset, sea state. Tapping one opens Conditions. |
| **Stop card** | Time column 46 dp (start 15/700, length 12). Card radius 18, padding 12. Number badge 28 dp, title 16/600, detail 14, "For you" line 13 in `link`, drag handle. Tap opens stop details; press and hold drags. A stop with a warning gets a 1.5 dp danger ring and an inline warning box with actions. |
| **Travel leg** | 44 dp row: 2 dp dashed line, mode icon 18, "CNG · 20 min · 9 km" (13/600), traffic dot plus word. Tap opens the leg sheet. |
| **Free time** | A dashed-outline card with a 44 dp "+" (add a stop). |
| **Lifted card (drag)** | Scale 1.03, 2 dp accent ring, shadow, haptic tick. Other days' tabs turn into "Move here" drop targets. |
| **Snackbar** | Bottom, 52 dp, inverse colours, with "Undo". |
| **Buttons** | Primary: pill, 52–56 dp, `accent`. Secondary: pill, `surfaceInset`. Destructive: `dangerBg` with `danger` text. |

## 4. Motion

- **Lifting and moving cards:** spring easing (about 180 ms).
- **Map:** the camera eases to the selected stop (about 400 ms).
- **Building your plan:** a dashed route animation.
- **Reduced motion:** with the phone's "remove animations" setting on, all of the above are instant.

## 5. Words

- **No developer words** in the interface ("valid", "constraints", "algorithm", "match %", "straight-line").
- **Sample values are not real data.** Sample values in the mockups (weather, traffic, road times, the getting-there cost) only show the design. In the app, each one comes from a named source with a "last updated" time.
- **Estimates are marked:** with "≈" or "about". Unknown prices are shown as unknown, never as ৳0.
- **Warnings say what is affected and what you can do** ("Move to Tuesday" / "Keep"). The app never says a route is "safe".

## 6. Accessibility

- **Touch targets:** at least 48 dp. The day ribbon is a summary, so it has one label for the whole day.
- **Drag and drop has a non-gesture route:** tap to lift, then "Move up", "Move down" or a day tab. TalkBack gets the same actions.
- **Contrast:** text contrast follows the Phase 8 checks (`contrast.test.ts` will include the new tokens).
