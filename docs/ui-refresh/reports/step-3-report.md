# Step 3 report: the Map sheet and Map Theme

**Date:** 2026-11-15. **Status:** done. **Mockups:** frames 6 and 7 of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

The Map sheet now has three large tiles for what the map shows and a line of theme pictures. Map Theme is one page: your own map as the preview, every theme, then "Make your own". After a first build, you compared the phone with the frames and asked for two more passes: "look the edges", then "the icon and the figure inside aren't as good as the mockup, revise the full UI". Last, you asked for the themes in one line you swipe. All of it is in this step.

## 1. What changed

### The Map sheet (`MapSheet.tsx`, frame 6)

- "Map" with a round close button.
- **Show on the map:** Trip trails, Places to plan and Friends as three large tiles, each with its icon, name, one line of what it does, and "On" or "Off" in words with a tick (not only colour). Each tile is a switch for screen readers. Friends shows only when you have friends, as before. With text above 1.2× the tiles become full-width rows, so no word has to break (Bangla at 1.6× broke "পরিকল্পনার" mid-word before).
- **Theme:** every theme, Classic too, as a small picture of your map in it, in one line you swipe. The line opens with the chosen theme in full view. Choosing applies at once and the sheet stays open, so you can compare on the map behind it. "All themes ›" opens Map Theme.
- Frame 6's lighter handle and its light navy dim behind the sheet (black in dark mode).

### Map Theme (`app/map/theme.tsx`, frame 7, D3)

- **The preview is your own map:** the home country fills the card's height, with your marks, the division lines and the division names the travel map draws at that zoom. A labelled sample (Europe) shows only when nothing is marked. "With a friend" switches it to the comparison colours (D3) and the legend follows.
- **Themes:** every theme in one line you swipe.
- **Make your own:** Colours as chips, each with its three colours as overlapping dots. Map style as pictures of your map in each style, with your colours on it.
- Reset (back to Default) in the header, Apply at the bottom. Leaving without Apply changes nothing. Premium locks are as they were (`FEATURE_PREMIUM_LOCKS`).
- The header title grows up to 1.3×, so "মানচিত্র থিম" stays whole at 1.6× (it was cut to "মানচিত্র…").

### The pictures, the icons and the edges (your second look)

I rendered frames 6 and 7 at the phone's scale (3×) and put them beside phone screenshots. What was wrong, and what it is now:

| What | Before | Now |
|---|---|---|
| A picture's edge | A 1.5 border, 1.5 of padding and a clip. The map ran into the border at the corners, so the gap round it was uneven. | As in the frames: a 1px hairline flush with the picture. The chosen one gets a 2.5 gap, then a 2.5 blue ring. Everything is drawn in one SVG, so all the edges are smoothed the same way. |
| Rounded corners | Android draws an SVG clip without smoothing: the corners had stair steps at 3×. | The picture's ground colour is painted round a rounded rectangle. That edge is smooth (checked at 4× zoom). |
| The figure | A 26°-wide crop with the whole home country in the Visited colour: a small blob. | As in the frames: the home country fills about 80% of the height, its divisions in your own marks (Visited, Lived, Want with its outline), fine seams between them, a crisp outline, the neighbours as plain land. Lines are about 0.4 dp, as in the frames. With nothing marked at home, the frames' sample shows (Khulna and Rajshahi visited, Mymensingh lived). |
| Style pictures | PNGs of Europe, unlike the theme pictures. | The same drawing in each style's colours. Pencil's hatching and Treasure's dots are SVG patterns. |
| Colour dots | An Android border round a filled circle, which left a coloured fringe. | One SVG per chip. |
| Icons | Icon-font glyphs, filled and of another weight. | The frames' own line drawings (`LineIcon`): trail, pin, friends, tick, close, chevron. |
| Size | Four fitted across (73 dp on this 360 dp phone); Classic wrapped to a second row. | About three and a half in view, so the cut-off one says there's more (89–90 dp on this phone; `rowThumbSize`). |
| Tiles and chips | 1.5 borders in the border colour, inset from the frames' padding. | The frames' hairline colour, and the padding moved in by the border's width, so the content sits where the frames put it. |

In the sheet, React Native's ScrollView didn't get the swipe: the sheet's own drag took it. The line uses gesture-handler's ScrollView, which shares the touch.

### Other

- New colour token `hairline`: frame 7's `#D5DCE7` in light, `#2E3B4F` in dark.
- `ThemePreviewMap.tsx` draws the divisions coloured by your marks, their lines and their names.
- Removed: `ThemeCard.tsx` (the old striped cards).
- New strings in `en.json` and `bn.json`.
- Maestro `03-theme-rustic`: no catalog tabs or swiping. Rustic is fourth in the line, in view on a phone.

## 2. How it was checked

On the USB phone, signed in as test account A.

| Checked on the phone | Result |
|---|---|
| Each layer tile | Switched on and off; the map changed at once (the trails at home zoom, a friend's "BE" marker). |
| Each theme from the sheet | Applied at once with the sheet open. |
| Map Theme: a theme, then colours, then a style | Midnight, then Wonder, then Sahara, Apply: the map took the mix, and reopening Map Theme showed it chosen. |
| With a friend | The preview and legend switched to In common, You and Friend. |
| Reset | Back to Default. Rustic was chosen again and applied afterwards. |
| Beside frames 6 and 7 at 3× | Title rows, tiles, ticks, icons, pictures, chips and footer match. Corners and rings are smooth at 4× zoom. |
| Swiping | Both lines (sheet and Map Theme), both ways, Default to Classic. Each opened with the chosen theme in full view. |
| Dark | Both screens. |
| Bangla at 1.6× (on the release build) | The tiles become rows and every word stays whole. Theme names, chips and the legend fit; Map Theme's "মানচিত্র থিম" and "রিসেট" are whole. Both lines swipe through to Classic. |
| Android Back with the sheet open | Closes the sheet. Once, right after a fast refresh in the debug build, Back left the app instead. It didn't happen again: 5 of 5 on the release build. |
| Release build: open and close the sheet over the map | 10 of 10: the sheet opened each time and closed (5 by its close button, 5 by Back), and the app stayed in front. |

Afterwards the phone was set back as it was: English, normal text size, Appearance System, the Rustic theme, the Friends layer off, and the debug build on Metro.

## 3. Checks at the end

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` (whole suite) | 693 of 693 passed |
| Maestro `03-theme-rustic`, `10-map-home` | both passed on the phone |

## 4. Left open

- **The map's own labels at home zoom.** Frames 1, 6 and 7 write country names in capitals ("INDIA"), leave out "Bangladesh" where its divisions are named, write division names in bold (dark or white on a marked division) and name the Bay of Bengal. The travel map and the globe write names as "India", and the preview copies the travel map, so the preview still shows "Bangladesh". Changing this is work on the travel map, not this step. I suggest step 20, unless you want it sooner.
- **Other sheets** keep their darker handle and dim until step 20; only the Map sheet has frame 6's.
- **The style PNGs** (`mobile/assets/map/styles/*.png`) aren't shown anywhere now. `scripts/map-themes/build.py` still makes them and `mapThemes.test.ts` checks them; they can go in step 20.
- **The pictures colour only your home country's marks.** Other countries stay plain land, as in the frames.
- **The friends' APK** is still not rebuilt (from step 1).

## Files

- New: `mobile/src/features/mapThemes/MapThumb.tsx`, `mobile/src/ui/LineIcon.tsx`
- `mobile/src/features/map/MapSheet.tsx`, `mobile/app/map/theme.tsx`, `mobile/src/features/mapThemes/ThemePreviewMap.tsx`
- `mobile/src/ui/theme/tokens.ts` (`hairline`)
- Removed: `mobile/src/features/mapThemes/ThemeCard.tsx`
- `mobile/src/i18n/en.json`, `bn.json`
- `mobile/src/__tests__/mapSheet.test.tsx`, `mapThemeScreen.test.tsx`, `mapThemes.test.ts`, `contrast.test.ts`
- `mobile/.maestro/03-theme-rustic.yaml`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.
