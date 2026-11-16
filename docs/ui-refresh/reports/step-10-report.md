# Step 10 report: The account picture on every tab

**Date:** 2026-11-16. **Status:** done. **Mockups:** frames 1 (Main), 15 (TripsTab), 18 (ExploreHeader) and 19 (FriendsHeader) of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

Your account picture is now at the top right of all four tabs, in exactly the same spot and size, and it opens Settings.

## 1. What changed

### The button (`src/ui/AccountButton.tsx`, new)

- **Size (D10):** the picture at 32 dp inside a 48 dp touch area, the size of Google's.
- **What it shows:** your photo, or your initials in your colour.
- **Screen readers** hear "Your profile and settings".
- **It opens Settings.**
- **Over the map** (frame 1) it sits on a white circle with a soft shadow, so it shows on any map theme.
- **One place:** its position is kept in one place (`ACCOUNT`: 12 dp under the status bar, 8 dp from the right), used by the Map and by every header.

### The same spot on every tab

| Tab | Where | Test ID |
|---|---|---|
| Map | Floats over the map. Before: a 42 dp picture in a 48 dp glass circle, 16 dp under the status bar and 16 dp from the edge. | `map-profile-button` (kept) |
| Explore | In the header, after the search field (frame 18) | `account-button-explore` |
| Trips | In the header, after "New trip" (frame 15) | `account-button-trips` |
| Friends | In the header, after the title (frame 19) | `account-button-friends` |

- **The header** (`TabHeader`, step 9) now has a fixed 56 dp row 8 dp under the status bar. The 48 dp button centred in it is 12 dp under the status bar, the same spot as on the Map.
  - The row's height is fixed, so nothing beside the button can move it, at any text size.
  - The header can also hold something other than a title, here Explore's search field.
- **Explore and Friends take the header too.**
  - **Explore:** the search field is in the header. It has a fixed height of 52 dp, and its text grows to 1.3× at most.
  - **Friends:** "Friends" no longer scrolls away with the list.
  - **Both** show the hairline once something is scrolled under them.
- **Not on inner screens:** not on a trip, a chat or Settings; only on the four tabs' front pages.

### Measured on the phone

The button's bounds, in pixels:

| Tab | Normal text | Largest text (1.6×) |
|---|---|---|
| Map | 912–1056, 146–290 | 912–1056, 146–290 |
| Explore | 912–1056, 146–290 | 912–1056, 146–290 |
| Trips | 912–1056, 146–290 | 912–1056, 146–290 |
| Friends | 912–1056, 146–290 | 912–1056, 146–290 |

The same on every tab: 48 dp, 8 dp from the right edge.

**Found on the phone, fixed:**
- **One pixel higher.** At first the headers' button sat 1 px above the Map's: the header's 1 dp hairline took that from the row. The row now allows for it.
- **Lower at 1.6×.** At the largest text the button sat 6 dp lower on Trips and Friends. Android grows the title's line with the phone's text size even though the title's own size stops at 1.3×. The header's height is now fixed, and the title still fits in it.

### Taken away

- **`LargeTitle`** (`src/ui/LargeTitle.tsx`): nothing uses it any more.
- **The Map's button style** (`profileButton`).
- **The string** `map.openSettings`; the button uses the new `common.account`.

### Not done from the frames

**Frame 19 draws an "+ Add" pill in Friends' header.** The Friends tab keeps its round button at the bottom right ("New message" in Chats, "Add a friend" in Friends). Moving those is a redesign of the Friends tab, which wasn't asked for in this step. Say if you want it.

## 2. How it was checked

On the USB phone as test account A (dev build, on Metro):

| Checked | Result |
|---|---|
| Switching through the four tabs | The picture stays put: the same bounds on every tab (the table above). |
| Tapping it on each tab | Map, Explore, Trips and Friends each opened Settings. |
| Explore (frame 18) | The search field, then the picture. |
| Friends (frame 19) | "Friends" and the picture in the header, the Chats and Friends switch under it. |
| Largest text (1.6×) | The picture in the same place on all four tabs; "Trips", "New trip" and the picture all show. |
| Bangla | "বন্ধুরা" and "ভ্রমণ" with the picture; Explore's search field "জেলা, দেশ ও শহর খুঁজুন" beside it. |
| Dark | The phone's own appearance (dark at the time). Light uses the same layout and the same colours as step 9's header. |

The phone was left in English, with Appearance System and text size 1.0.

## 3. Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 763 of 763 passed |
| Maestro `01-tabs` | passed twice in a row |

New tests:
- **Jest, `accountButton.test.tsx` (5):**
  - the button without a photo: initials at 32 dp in a 48 dp area, and it opens Settings;
  - with a photo;
  - over the map;
  - in a header: the 56 dp row, the button last, 8 dp from the right;
  - Explore's header.
- **Jest, Trips and Friends tests:** each also checks its button.
- **Maestro, `01-tabs`:** now checks the button on Trips, Friends and Explore; the Map's is checked by opening Settings, as before. The sign-out flow still uses `map-profile-button`, which is kept.

About Maestro `01-tabs`: the tap on the Explore tab was lost twice in four runs on this phone (in step 9 too, before this step's changes). My own taps on Explore always worked. The flow now taps again when nothing changed (`retryTapIfNoChange`), and passed twice in a row.

## 4. Left open

- **Friends' "+ Add" pill** from frame 19 (above).
- **The Map tab has no screen test in Jest:** the map library needs too much faking. Its button is the same component, and the phone check and Maestro cover it.

## Files

- New:
  - `mobile/src/ui/AccountButton.tsx`
  - `mobile/src/__tests__/accountButton.test.tsx`
- Changed:
  - `mobile/src/ui/TabHeader.tsx` (the fixed row; something in place of the title)
  - `mobile/app/(tabs)/index.tsx`, `explore.tsx`, `trips.tsx`, `friends.tsx`
  - `mobile/src/i18n/en.json`, `bn.json`
  - `mobile/src/__tests__/trips.test.tsx`, `friends.test.tsx`
  - `mobile/.maestro/01-tabs.yaml`
- Removed: `mobile/src/ui/LargeTitle.tsx`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed.

The 13 earlier unpushed commits (step 0 to step 8) were also given that line, as you asked. Their files, authors and dates are unchanged; their hashes changed.
