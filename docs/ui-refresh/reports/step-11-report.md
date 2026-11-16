# Step 11 report: The hotel list, only places to stay

**Date:** 2026-11-16. **Status:** done. **From:** your screenshots 3 and 5 (a sweet shop among Barishal's hotels; every row "Standard · Price not known").

No eatery, shop or other non-lodging place is offered as somewhere to stay any more. The rule is in the data platform, not the app: the source's category first, the name only tips a doubtful one, and a listing still in doubt waits for review instead of being listed. A hotel without a price now says what sort of place it is and how far it is from the centre.

## 1. Where hotels come from, and how the sweet shop got in

- **The source:** Overture Maps' business listings (`overture_service_places`), Bangladesh's lodging and food categories, plus the ministry's list of star hotels.
  - A listing with "hotel", "resort", "inn"… is filed as accommodation.
  - With a listing score of 0.8 or more it's published.
  - A published one within 6 km of a destination's centre becomes a hotel the app offers (`publish service-places`).
- **The sweet shop:** "হক মিষ্টান্ন ভান্ডার" in Barishal. Overture's category for it is **hotel**, and its score was 0.805, just over 0.8.
  - In Bangladesh many eateries are called "hotel" (হোটেল is also a word for a place to eat), and listings tag them so.
  - Nothing looked at the name, so it was published and listed.

### How many looked wrong (2026-11-16)

**By the source's own category** (all 2,673 accommodation listings):

| Category | Listings |
|---|---|
| hotel | 2,181 |
| resort | 345 |
| none (the ministry's star list) | 125 |
| bed and breakfast | 21 |
| inn | 1 |

The category alone can't tell: the sweet shop is "hotel".

**By words in the name** (English and Bangla), of the 2,585 accommodation listings still in use:

| Result | Listings |
|---|---|
| Places to eat | 19 |
| Not places to stay (a shop, a mosque, a graveyard…) | 8 |
| In doubt: "X Hotel & Restaurant" and the like | 56 |
| Places to stay | 2,502 |

**Of the 937 hotels the app offered:** 21 (8 eateries, 4 not places to stay, 9 in doubt). None of them had a price.

**Ten examples:**

| Listed as a hotel | Where | Now |
|---|---|---|
| হক মিষ্টান্ন ভান্ডার (a sweet shop) | Barishal | moved to the restaurants |
| Kettle Cafe Lalbagh | Dhaka | moved to the restaurants |
| Grand A. Malek Chinese Restaurant | Brahmanbaria | moved to the restaurants |
| Four Star Hotel & Kabab House | Cumilla | moved to the restaurants |
| Shajalal Khabar Hotel (খাবার হোটেল, a food hotel) | — | moved to the restaurants |
| NR Store | Khulna | out of the hotels |
| চাপাতলী কবরস্থান, শেরপুর (a graveyard, listed twice) | Sherpur | out of the hotels |
| চাদনীঘাট জামে মসজিদ (a mosque) | — | out of the hotels |
| Sabuj Hotel & Restaurant | Chattogram | waiting for review |
| সিটি ইন রেস্তোরাঁ সুইটস এন্ড বিরিয়ানি হাউজ (an inn, a restaurant, sweets, biryani) | Cumilla | waiting for review |

Every listing the rule changed is in `data-platform/quality-reports/lodging-2026-11-16.md`.

## 2. The rule (`data-platform/vromon_data/lodging.py`)

A listing filed as accommodation:

1. **On the ministry's star list:** a place to stay.
2. **The source's category first.**
   - Categories that can only be lodging (resort, guest house, motel, hostel, B&B, inn, lodge, cottage) are places to stay.
   - If such a listing's name says plainly it's food, a shop or something else, it goes to review.
3. **"Hotel", or no category, is doubtful in Bangladesh, so the name tips it:**
   - **A word for staying** (residential, আবাসিক, resort, guest house, rest house, motel, cottage, suites…): a place to stay. "Inn" alone counts only when nothing says food.
   - **A phrase that names an eatery** (খাবার হোটেল, "Kabab House"): food, whether or not it says "hotel".
   - **Words for food** (restaurant, রেস্টুরেন্ট, রেস্তোরাঁ, sweets, মিষ্টান্ন, biryani, kabab, café…): food. With "hotel" in the name too ("X Hotel & Restaurant", which may well have rooms): review.
   - **Words for a shop** (store, mart, traders, ভান্ডার…) **or a place that hosts no one** (graveyard, mosque, school, community centre…): not a place to stay. With "hotel" too: review.
   - **No word either way:** the category stands, so it's a place to stay.

**Names are split into whole words,** English and Bangla (with its vowel signs), and two-word phrases are matched on the words. So "চাপাতলী" isn't "চা" (tea), "Tea Heaven Resort" is a resort, "Hotel Sweet Dream" is a hotel and "Rich Mart Rest House" is a rest house.

### What happens to each

| Verdict | What changes |
|---|---|
| Food | It moves to the restaurants: kind food; category restaurant, or dessert shop for sweets. |
| Not a place to stay | Its status is rejected, so it leaves the hotels. |
| In doubt | It goes to review (status needs review, an open `not_a_stay` task). A reviewer's approve lists it as a hotel; reject takes it out (`review.decide`). |

- **Recorded:** every change is a `not_a_stay` review task with the words that decided it.
- **People come first:** a listing a person already decided is left alone.
- **Safe to run again:** a second run changes nothing.
- **Imports follow the same rule:** the Overture import applies it too, so a later import doesn't put them back.

### Publishing (`publish service-places`)

- **A listing that moved to the restaurants** hides its old hotel row and gets a restaurant row.
- **Each hotel now has its kind:** hotel, resort, guest house, rest house, motel, cottage, B&B or hostel. This is a new `hotels.kind` column (migration 0036).
- **Trips are safe:** rows are hidden, never deleted, so a trip that chose one keeps it.

### On the real database

1. **On a copy first.** It gave the same counts as above.
2. **A backup:** `backend/vromon-backup-2026-11-16-before-lodging.db`.
3. **Then the real database:** migration 0036, the rule (`python -m vromon_data lodging`), then `publish service-places`.

The results:
- **The lists:** 937 hotels before, 916 after; 82 priced before and after.
- **The four towns you asked about:**

  | Town | Before | After |
  |---|---|---|
  | Barishal | 12 | 11 (the sweet shop is out) |
  | Khulna | 28 | 26 (NR Store and "Hotel Noor Aian and Restaurant") |
  | Cox's Bazar | 175 | 173 |
  | Kuakata | 55 | 55 |

- **The kinds now listed:** 655 hotels, 215 resorts, 23 guest houses, 12 motels, 7 rest houses, 3 B&Bs, 1 cottage.
- **Trips that chose one of the 21: none.** No trip, night's stay, stay suggestion or rating used any of them, so nobody's trip changed.

## 3. The rows in the app (`StaysSheet.tsx`, `stays/hotelRow.ts`)

- **What a row says** is what sort of place it is and how far from the centre, with its price when known:
  - **with a price:** "Resort · ৳3,500 a night · 1.2 km from the centre";
  - **without a price:** "Rest house · 0.7 km from the centre · Price not known", or "Hotel · In the centre · Price not known".
  - **The demo hotels** (no kind) keep their level.
- **"Standard" is gone from unpriced rows.** It was the default for every hotel without a price or stars, so it told you nothing.
- **The order:** priced first (cheapest first), then rated ones, then the rest nearest the centre first. Before, unpriced hotels were ordered by a rating every one of them shared.
- **The distance** comes from the server (`km_from_centre`, from the hotel's and the destination's coordinates). The kind comes from `hotels.kind`.
- **The address** wasn't used as an "area": in the data it's often a holding number or just the upazila ("কলাপাড়া"). The distance is always true.
- **Everywhere hotels are offered follows,** because the rule is in the data:
  - "Where you'll stay" on New trip, and "Change" on a trip's night (the same sheet);
  - New trip's budget line;
  - the planner's own hotel choice;
  - the stay advisor (it only suggests priced hotels);
  - the catalog's hotels.

## 4. How it was checked

On the USB phone as test account A (dev build), New trip, "Where you'll stay", all nights, every row read by scrolling to the end:

| Town | Rows | Eateries or shops | What the rows say |
|---|---|---|---|
| Barishal | 11 | 0 | All unpriced: "Hotel Athena International · Hotel · In the centre · Price not known" … "Rich Mart Rest House · Rest house · 0.7 km …", nearest first. The sweet shop is gone. |
| Khulna | 26 | 0 | The same as the server's list. |
| Cox's Bazar | 173 | 0 | The 18 priced first, cheapest first ("Hotel Regal Palace · Hotel · ৳2,250 a night · 2.6 km from the centre"); then the rest nearest first. |
| Kuakata | 55 | 0 | Priced first ("Muktijodda Sultan In -Residential · Hotel · ৳1,790 a night · In the centre"); then nearest first. |

No trip was saved. The rows in Bangla ("গেস্ট হাউস · কেন্দ্র থেকে ১.৫ কিমি · দাম জানা নেই") are checked in Jest; I didn't switch the phone to Bangla for this step.

## 5. Checks

| Check | Result |
|---|---|
| Data platform `pytest tests` | 71 passed (62 before) |
| Backend `pytest -q` | 833 passed, 9 skipped |
| `npx tsc --noEmit` | clean |
| `npx eslint . --max-warnings 0` | clean |
| `npx jest` | 768 of 768 passed |

New tests:
- **Data platform, `test_lodging.py` (9):**
  - the rule on 30 real listings of each kind (stays, food, not a stay, in doubt);
  - Bangla words keep their vowel signs;
  - the sort of place;
  - the pass: moves, removals, review, a person's decision standing, a second run adding nothing, a review approval listing it again;
  - the import: the sweet shop filed as food, the graveyard rejected, "Hotel & Restaurant" in review;
  - publishing: the row moves and a trip that chose it keeps it.
- **Backend:** the hotel list says each hotel's kind and how far from the centre, and a hidden one isn't listed.
- **Jest, `hotelRows.test.tsx` (5):** rows with and without a price, a demo hotel, Bangla, and the order.

## 6. Left open

- **56 listings wait for review** (`python -m vromon_data review list`, type `not_a_stay`). Most are "X Hotel & Restaurant". Until a person decides, they aren't offered. Your data collector could settle them: approve lists one as a hotel, reject takes it out.
- **Prices:** still 82 of 916 hotels. The rows are honest about it, but more room rates would help (D11).
- **One odd listing:** "Hotel Mohona Kuakata" is listed under Barishal, 4.3 km from its centre. Its coordinates are in Barishal, though its name and address say Kuakata. A data question, not this step's.

## Files

- Data platform:
  - New: `vromon_data/lodging.py`, `tests/test_lodging.py`, `quality-reports/lodging-2026-11-16.md`
  - Changed: `vromon_data/connectors/service_places.py` (the import uses the rule), `vromon_data/publish.py` (kind, moved rows), `vromon_data/review.py` (`not_a_stay` decisions), `vromon_data/cli.py` (`lodging` command)
- Backend:
  - New: `alembic/versions/20261116_0036_hotel_kind.py`
  - Changed: `app/models/models.py` (`Hotel.kind`), `app/schemas/schemas.py` (`HotelOut.kind`, `km_from_centre`), `app/api/v1/endpoints/destinations.py`, `tests/test_trip_stays.py`
- App:
  - New: `src/features/trips/stays/hotelRow.ts`, `src/__tests__/hotelRows.test.tsx`
  - Changed: `StaysSheet.tsx`, `src/types/index.ts`, `src/i18n/en.json`, `bn.json`
- `docs/ui-refresh/prompts.md` (Status table), this report

## Git

Committed by the agent on `main`, ending with `Co-authored-by: mdsulaimanshakil <mdsulaimanshakil@gmail.com>`, with no Claude co-author line. Nothing was pushed. The database and its backup aren't in git.
