# Step 13 report: Account and settings, redesigned

**Date:** 2026-11-18. **Status:** done. **Mockups:** frames 26 (Settings) and 27 (SettingsProfile) of https://claude.ai/artifact/7f9GgTspfJmCSJ49MLseTt. **Decision:** D16.

Settings now opens on you: your photo, name and travel numbers on the hero card, with "Edit profile" one tap away. Every setting sits in a group with an icon and shows its current value. Sign out and Delete account stand apart and say what they do. Edit profile follows frame 27: your username's check shows inside its field, and Save stays at the bottom.

## 0. The mockups' new link

From this step on, the account the work is done from uses the owner's copy of the mockups: https://claude.ai/artifact/7f9GgTspfJmCSJ49MLseTt. I checked it against the original (https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN):

- **The frames:** all 40, and the canvas layout file, are byte for byte the same (41 of 41 files).
- **The pictures:** the 24 pictures the frames use are all in the copy, under the same names. This account can't list the original's pictures, so their bytes weren't compared.
- **Only the canvas tool's own files differ:** they're a newer version of the tool.

`docs/ui-refresh/prompts.md` now links the copy; the reports for steps 0–12 keep the original link.

## 1. Settings (`app/settings/index.tsx`, frame 26)

### Who you are (`src/features/account/SettingsHero.tsx`, new)

- **On the hero card:** your photo (or initials) in a white ring, your name, and "@username · Your country".
- **Three numbers from your own marks and trips:**
  - countries you've been to;
  - your country's regions ("2 of 8 divisions"), or, for a country whose regions aren't in the app, your cities;
  - trips taken (finished trips).
- **They're the travel dashboard's own numbers** (`travelSummary`, step 2), so the two always agree. Tapping them opens Your travels.
- **"Edit profile" and "Friend code"** (which opens your code, as the old row did).
  - They sit side by side when both labels fit on one line, as in the frame.
  - Otherwise each takes a full row. Without this, Bangla at the default text size squeezed "প্রোফাইল সম্পাদনা" onto two lines (seen on the phone).

### The groups (`src/ui/SettingsRow.tsx`, still the one place a row is defined)

- **Each group** is a white card under a small label. Every row has an icon on a tinted circle in the group's colour: Preferences blue, Privacy and friends green, Your data and About grey, Delete red.
- **Rows** are at least 54 dp tall, and the line between rows starts at the title.
- **Icons are decoration,** hidden from screen readers. Each row is read as its title, second line and value.

| Group | Rows (the frame's words) |
|---|---|
| Preferences | Language · Appearance ("Same as the phone", Light, Dark) · Map theme (a small picture of the chosen theme with your marks, and its name) · Distances in · Vibrate on taps |
| Privacy and friends | Let people find me by username · Chats and privacy, with "Read receipts, trip sharing, notifications, blocked people" under it |
| Your data | Download my data · Delete account (red, and the words say it) |
| About | Licences and data sources · Version |

- **Sign out** is its own button at the end (white with a ring), with "Signed in as …" under it.
  - It asks first: "Sign out everywhere? This signs you out of Vromon on this phone and on every other phone where you use this account. Your trips and travel map stay in your account."
  - That is what it does today. The behaviour isn't changed; whether it should end only this phone's session is still open (see section 6).
- **Sign-in switched off in a build:** Sign out and the email don't show, as before.
- **"Cancel" in the app's dialogs** is now in the app's language. Before, it was English in Bangla too (`src/utils/dialogs.ts`).

## 2. Edit profile (`app/settings/profile.tsx`, frame 27)

- **The photo** (`AvatarPicker`): 104 dp in a white ring with a soft shadow, and a blue camera badge.
  - Tapping the photo, or "Add photo" / "Change photo" under it, opens: Choose from your photos, Take a photo, Remove photo (in red, when there is one).
  - The note that everyone who sees your profile sees the photo, and that it's stored on ImgBB, is now at the foot of that sheet.
- **Name:** "Friends see this name."
- **Username:** "@" in front, and its check inside the field, as a word with an icon:
  - "✓ Yours", "✓ Free", "✕ Taken" or "Checking…";
  - a name that breaks the rules says which rule under the field.
- **Your country:** its flag and name, opening the country picker, with "The map and Explore open on your country."
- **The email:** shown on a grey panel, "Email (can't be changed here)".
- **Save** stays fixed at the bottom, above the keyboard. It works only when something changed and the username is fine.
- **Leaving with changes not saved** asks "Leave without saving?" (Keep editing / Leave).

### A crash found and fixed on the phone

- **What happened:** the first Save on the phone closed the app. The save reached the server, then the app died with "ScreenStackFragment added into a non-stack container" (react-native-screens).
- **The cause:** the screen's "ask before leaving" switch turned off at the same moment the screen closed, and the navigation library then updated the closing screen's header.
- **The fix:**
  - The form compares with what it opened with, so saving doesn't flip that switch.
  - After Save the screen leaves the way "Leave" does, just without the question.
- **Checked:** five saves in a row on the phone, with the keyboard open and closed. The app kept running every time, and the server had each name.

## 3. The other screens and pickers

| Screen | Now |
|---|---|
| Chats and privacy | The same cards and tinted icons; each group's note sits under its card. |
| Blocked people | The people in one card, each with Unblock. |
| Delete account | What gets deleted is said on a card with a warning sign, before the username can be typed. |
| Your country (the picker) | Titled "Your country", with the line that says what it changes; its search field has the same outline as every text field. |
| Language, Appearance, Distances in | The existing sheet, already in the look (white sheet, rows, a check on the chosen one). Only the words changed. |

**Shared pieces:**
- **`TextField`:** 56 dp, a thin line round it; focused, a blue line and a soft ring. It can show something before the text ("@") and at its end (the check).
- **`Button`:** a new `outline` style for Sign out.
- **`ActionSheet`:** can carry a note at its foot.

Other screens use the same `TextField`, so they get the new field look too: sign in and sign up, the password screens, New trip's city search and "Add a place" on the map. Onboarding's username uses the same `UsernameField`, so it shows its check inside the field too ("✓ Free", "✕ Taken").

## 4. Words (English and Bangla)

- **The frame's words went in:**
  - "Vibrate on taps" (ট্যাপে কম্পন);
  - "Distances in" (Bangla keeps দূরত্বের একক, the natural phrase);
  - "Same as the phone" (ফোনের মতো);
  - "Download my data";
  - "Licences and data sources";
  - "Privacy and friends";
  - "Map theme";
  - "Your country" (আপনার দেশ);
  - "Name";
  - "Friend code".
- **Where I didn't copy the frame:**
  - **The username line:** the frame says "Letters, numbers and _ only", but dots are allowed too. The line says the real rule: "Friends can find you by it. 3–20 letters, numbers, dots or underscores."
  - **"trips taken",** not the frame's "trips": the number counts finished trips only.
  - **Chats and privacy's line** adds "trip sharing": "Show my trips to friends" is in there, and it's a privacy switch someone may look for.
- **Removed, now unused:**
  - Settings' Profile and Account section titles, "My friend code";
  - the profile's "Display name" lines and "Email";
  - onboarding's "Available", "Checking…" and its old username hint (the check is in the field now, in onboarding too).

## 5. How it was checked

### On the phone (test account A, dev build)

Your phone's text size is 0.9 (your setting), so I checked at 0.9 first, then at the default 1.0 and the largest 1.6, and set it back to 0.9.

| What | Result |
|---|---|
| Settings, dark and light, at 0.9 | As frame 26: the hero (2 countries, 2 of 8 divisions, 12 trips taken), the four groups with their icons and values, the map theme's picture, Sign out with the email under it. |
| The numbers | Tapping them opens Your travels. |
| Pickers | Appearance → Light (the app turned light) and back to "Same as the phone"; Language → বাংলা and back to English; Distances in opened (Kilometres kept). |
| Rows that open screens | Map theme, Friend code, Chats and privacy, Blocked people, Delete account (only opened). |
| Change the name and save | "Ana (E2E)" → "Ana (E2E) T" → back: the server had each name, and Settings showed it. (This is where the crash in section 2 was found and fixed.) |
| A taken username | "e2e.bob" (test account B's): "✕ Taken" inside the field with a red line, Save off. Left with "Leave without saving?" → Leave: nothing saved. |
| Change the country and set it back | Nepal: "@e2e.ana · Nepal", and the middle number became "2 cities". Then back to Bangladesh (the server says `BD`). |
| Bangla | The hero in Bangla digits (২, ২ / ৮, ১২), every group, Edit profile. |
| Default text size (1.0) | English: the two hero buttons side by side, as in the frame. Bangla: the two buttons stack instead of squeezing a label onto two lines (fixed here). |
| Largest text (1.6×), Bangla | Nothing cut in Settings or Edit profile; values move under their titles when there's no room beside them. |

**Not on the phone:**
- Sign out: it would end every session of test account A.
- Changing the photo: it uploads to ImgBB.
- Download my data: it opens the share sheet.

All three are covered in Jest or unchanged.

### Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 794 of 794 passed (781 before). Two full runs alongside the phone checks each had a different test time out (photos once; Today and trip review once); those files pass alone, and a third full run passed. |
| Backend | not touched in this step |

**New tests:**
- **`settings.test.tsx` (11), the page:**
  - signed in, your three numbers (a Want isn't a visit, an upcoming trip isn't taken) opening Your travels;
  - another home country (cities in the middle);
  - every group's rows in the frame's words;
  - Sign out's confirmation and the email;
  - sign-in switched off (no Sign out);
  - Bangla with Bangla digits.
- **`settings.test.tsx`, the profile form:**
  - unchanged (Yours, Save off, the email can't be changed);
  - a taken username;
  - a username that breaks the rules;
  - a free username saved, then back;
  - leaving with changes asks, without changes doesn't.
- **Updated:**
  - `navigation.test.tsx`: the frame's "Same as the phone", and the Edit profile button;
  - `contrast.test.ts`: the hero's number panel, the groups' icons on their tints, the username check's words.

## 6. Left open

- **Sign out's scope:** it still ends every session of the account on every phone (now said plainly before it happens). Signing out only this phone is a one-line change, waiting for your decision.
- **Long titles at 1.6×:** the app's shared header shortens a long title at the largest text ("প্রোফাইল স…" for Edit profile in Bangla). It's the same on other screens, so better done once for all of them (step 20).
- **The friends' APK:** not rebuilt. You said no last time; say if you want it now. This step doesn't change the server.

## Files

- **New:**
  - `src/features/account/SettingsHero.tsx`
  - `src/__tests__/settings.test.tsx`
- **Changed:**
  - Screens: `app/settings/index.tsx`, `profile.tsx`, `chats.tsx`, `blocked.tsx`, `delete-account.tsx`, `home-country.tsx`
  - UI: `src/ui/SettingsRow.tsx`, `TextField.tsx`, `Button.tsx`, `ActionSheet.tsx`, `src/ui/theme/tokens.ts` (`heroInset`, `heroInsetLine`)
  - Features: `src/features/account/AvatarPicker.tsx`, `UsernameField.tsx`, `src/features/geo/CountryList.tsx`
  - Other: `src/utils/dialogs.ts`, `src/i18n/en.json`, `bn.json`
  - Tests: `src/__tests__/navigation.test.tsx`, `contrast.test.ts`
- **Docs:** `docs/ui-refresh/prompts.md` (the mockups' new link, the Status table), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed.
