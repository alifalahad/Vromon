# Step 4 report: New trip, the weekday alone and typed travellers

**Date:** 2026-11-15. **Status:** done. **Mockup:** frame NewTripWhen of https://claude.ai/artifact/RMjDbAXaeW6DNQKAY8pBNN.

Under From and To there's now only the day of the week. The number of travellers can be typed as well as stepped with − and +.

## 1. What changed

### The weekday (`DateRangeFields.tsx`)

- The line under each date is the weekday alone, in the app's language: "Sunday", "Tuesday"; "রবিবার", "মঙ্গলবার". Before it was "Sunday, 22 Nov".
- As in the frame it's a little larger (14.5, medium) with a little space above. There's room under it now, so it no longer touches the Travellers card.
- The test IDs `date-start-weekday` and `date-end-weekday` stay.

### Travellers (`TravellersField.tsx`, new; replaces `Stepper` in `app/trip/new.tsx`)

- **Layout:** as in the frame, the travellers icon and "Travellers", then a round −, the number in a small field (60 × 44, the title font), then a round +. The − and + are the frame's own line drawings, added to `LineIcon`.
- **Typing:** touching the number turns its edge blue, opens the number pad and selects the old value, so typing replaces it. Bangla digits are accepted (the same `digitsOnly` as BudgetCard).
- **When it counts:** a number from 1 to 50 (D4) counts at once, so the budget and every "for N travellers" line follow while you type. Leaving the field with 0, more than 50 or nothing sets the nearest allowed number and says so under the row:
  - "At least 1 traveller: set to 1"
  - "At most 50 travellers: set to 50"
  - "Nothing typed: still 12"
- **− and +** keep working while typing, counting from what was typed (out of range counts from the nearest allowed number).
- **Keyboard:** the screen scrolls the row clear of it, the way CitySearch does.
- **Screen readers:** it's a labelled field with its limits: "Travellers, from 1 to 50" ("ভ্রমণকারী, ১ থেকে ৫০ জন").
- **Large text:** above 1.2× the − / number / + go on a line of their own. In Bangla at 1.6× "ভ্রমণকারী" broke in the middle of the word before.
- The test IDs `travellers-less`, `travellers-value` and `travellers-more` stay. `travellers-value` is now the field itself, and the line under the row is `travellers-note`.

### Elsewhere (prompt point 3)

Travellers can't be changed anywhere else. The trip screen, the budget and the next-trip card only show the number (`num_travelers`), so nothing else changed.

### Taken away

The old `Stepper` and its three styles, and the `rowCard` style it sat in (`app/trip/new.tsx`).

## 2. How it was checked

On the USB phone, as test account A (dev build).

| Checked on the phone | Result |
|---|---|
| The weekdays | "Sunday" and "Tuesday" under 22/11 and 24/11, with room before the Travellers card. |
| Touching the number | Its edge turned blue, the 2 was selected, the number pad came up, and the row moved clear of the keyboard. |
| Typing 12, Done | 12. |
| Typing 99, Done | 50, with "At most 50 travellers: set to 50" under the row. |
| − after that | 49. |
| Typing 12, then the next page | The budget read "for 12 travellers, 2 nights", ৳151,000, "≈ ৳12,600 each". |
| Bangla at 1.6× | রবিবার and মঙ্গলবার whole. "ভ্রমণকারী" is whole on its own line, with −, ১ and + under it. Typing 0 gave ১ and "কমপক্ষে ১ জন: ১ করা হলো". |
| Light, Bangla | Same layout, readable. |

Bangla digits typed on the phone weren't tried: adb can't type Bangla characters, and the number pad shows Latin digits. The tests cover ১২.

Afterwards the phone was set back: English, normal text size, Appearance System, the Rustic theme (it had become Custom during step 3's checks).

## 3. Checks

| Check | Result |
|---|---|
| Before starting | tsc and eslint clean; Jest 693 passed (the step-3 baseline) |
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` (whole suite) | 703 of 703 passed (10 new in `travellersField.test.tsx`: the weekday in English and Bangla; typing 12, 0, 99, ১২ and nothing; − and + after typing; Bangla digits and the field's label) |

`newTripScreen.test.tsx` now reads the travellers number as the field's value.

## 4. Left open

- **The rest of frame NewTripWhen** belongs to later steps: "Getting there · optional" is step 5, and the date boxes' larger type isn't part of this step. The date boxes keep their size: at the frame's 20-point bold, "22 / 11 / 2026" wouldn't fit a 360 dp phone's half-width field.
- **No Maestro flow** uses the travellers IDs, so none changed.

## Files

- New: `mobile/src/features/trips/new/TravellersField.tsx`, `mobile/src/__tests__/travellersField.test.tsx`
- `mobile/src/features/trips/new/DateRangeFields.tsx`, `mobile/app/trip/new.tsx`, `mobile/src/ui/LineIcon.tsx` (− and +)
- `mobile/src/i18n/en.json`, `bn.json`
- `mobile/src/__tests__/newTripScreen.test.tsx`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, with no co-author line. Nothing was pushed.
