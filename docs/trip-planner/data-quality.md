# Destination Data Quality

**Built:** 2026-10-19 by `backend/scripts/import_destinations.py` · **Sources:** Wikivoyage (CC BY-SA 4.0), Wikidata (CC0)

Nothing here has been checked by a person yet. In the app, an unknown price says "Price unknown" and
unknown hours say "Hours not checked" (the planner then assumes 09:00–17:00). Ratings are unknown for all of them.

| Destination | Places | With hours | With a price | With a description | Restaurants (priced) | Hotels (priced) | Description | Categories |
|---|---|---|---|---|---|---|---|---|
| Dhaka | 40 | 0 | 0 | 40 | 0 (0) | 0 (0) | yes | Culture 16, History 11, Family 8, Nature 3, Shopping 2 |
| Khulna | 17 | 1 | 1 | 16 | 0 (0) | 1 (1) | yes | Culture 10, History 6, Family 1 |
| Tangail | 7 | 0 | 0 | 7 | 0 (0) | 0 (0) | yes | Culture 3, History 2, Family 1, Nature 1 |
| Sylhet | 15 | 2 | 0 | 15 | 0 (0) | 5 (0) | yes | Nature 5, Culture 4, History 3, Shopping 2, Family 1 |
| Chattogram | 40 | 2 | 5 | 39 | 20 (3) | 10 (1) | yes | Culture 20, Beach 5, History 4, Nature 4, Scenic 4, Family 3 |
| Bandarban | 7 | 0 | 0 | 6 | 0 (0) | 0 (0) | yes | Nature 5, Culture 2 |
| Rangamati | 8 | 0 | 0 | 8 | 0 (0) | 0 (0) | yes | History 3, Nature 2, Family 2, Culture 1 |
| Sreemangal | 14 | 0 | 0 | 12 | 0 (0) | 2 (0) | yes | Nature 9, Culture 4, Family 1 |
| Kuakata | 7 | 0 | 0 | 7 | 0 (0) | 0 (0) | yes | Nature 3, Beach 3, Culture 1 |
| Rajshahi | 33 | 2 | 4 | 33 | 1 (0) | 9 (3) | yes | Culture 16, History 6, Family 4, Shopping 3, Nature 2, Scenic 2 |

**Left out while importing** (Wikivoyage listings):

| Destination | Listings read | No coordinates | Outside the area | Matched to a Wikidata sight |
|---|---|---|---|---|
| Dhaka | 0 | 0 | 0 | 4 |
| Khulna | 11 | 5 | 0 | 5 |
| Tangail | 2 | 2 | 0 | 0 |
| Sylhet | 14 | 2 | 0 | 1 |
| Chattogram | 121 | 11 | 1 | 25 |
| Bandarban | 1 | 1 | 0 | 0 |
| Rangamati | 6 | 6 | 0 | 0 |
| Sreemangal | 7 | 0 | 0 | 2 |
| Kuakata | 1 | 1 | 0 | 0 |
| Rajshahi | 57 | 17 | 0 | 12 |

**What a person should check first:** each destination's top places (opening hours, entry fees for locals
and foreigners, whether it's still open), and the hotels' current prices.
