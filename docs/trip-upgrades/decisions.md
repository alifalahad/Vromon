# Decisions (confirm in step 0)

Each decision has a recommendation the steps follow unless the owner chooses otherwise in step 0. Record the answer in the **Answer** line, with the date.

| ID | Question | Recommendation | Why |
|---|---|---|---|
| **D1** | Which stay choices? | **Hotel · With family or friends (no cost) · Day trips, no night · Decide later**, per night, with "all nights" as the usual case | Covers hotels, relatives, own home and "only the trip" without extra concepts |
| **D2** | Who sees a family/friend's home? | **Only the trip's owner.** Friends viewing the trip and trip-room members see "Staying with family", with no pin, no label and no distance; it's left out of chat cards and of everyone else's exports | It's someone else's home address |
| **D3** | Does "finish by" include the way back? | **Yes.** The day is planned so you are back at the stay by "finish by", and the return leg is drawn and counted | Matches what people mean by "back by 8 pm"; today's plans overrun by the return time |
| **D4** | When is moving to another stay "worth it"? | Suggest when (money saved ≥ the larger of ৳1,000 and 10% of that stay, and road time not worse by more than 30 min) **or** (road time saved ≥ 60 min, and money not worse by more than ৳500 a night). A move costs 45 min of hassle plus the transfer. At most one move every 2 nights, unless it saves ≥ 2 h a night. At most 2 suggestions at once. A dismissed suggestion returns only if its saving grows by more than 25% | Shows real numbers, avoids hotel hopping, and stays quiet once dismissed |
| **D5** | How are time and money weighed? | ৳5 per minute of road time, per group, as the default. Later a setting "My time is worth: low / normal / high" (৳2 / ৳5 / ৳10) | One number makes "saves ৳800 but adds 40 min" comparable |
| **D6** | Meal choices | Per meal: **Best places to eat (default) · Bring my own · Where I stay** (breakfast and dinner only), per trip with a per-day override. Own food costs 0 unless an amount per person is entered. Offer "breakfast and dinner where you stay?" once when the stay is family/friends | Optional, default unchanged, simple |
| **D7** | When can a trip be rated? | *Decided:* **any time during the trip** (from its first day) and after. Optional item ratings. One in-app reminder card on the Trips tab the day after it ends; no push. "Rate this plan" stays as it is | Rate while it's fresh, never nagging |
| **D8** | Who can rate a shared trip? | **Each person who was on it:** the owner and trip-room members each have their own review | Each traveller's experience differs |
| **D9** | How are single things rated, and shared? | *Decided:* each item is **good or bad** (👍 / 👎) with an **optional comment**. No highlight cards, no sharing to chats or profiles. Ratings stay private; using them for others' recommendations is a later decision | What the owner meant by "extraordinary or worst": a simple good/bad with a comment |
| **D10** | Search sources | Vromon places → Vromon catalog within 25 km → Overture places index (all categories, "not checked") → ORS geocoding for addresses → "Put a pin on the map". Unlisted stops are private to the trip; "Suggest this place to Vromon" sends them to review | Free, already-licensed data first; one key you already have for addresses; never a dead end |
| **D11** | Hotels without a price (added in step 0) | Prefer a priced, real-named hotel near the stops at or near the budget level; else "unknown", never a guess | Only 82 of 937 hotels are priced |

**Answers** (owner, 2026-11-12, step 0)

- D1: as recommended. Hotel · family or friends · day trips · decide later, per night.
- D2: as recommended. Only the trip's owner sees a family/friend's home.
- D3: as recommended. "Finish by" means back at the stay; the way back is counted and drawn.
- D4: as recommended (only when it clearly wins).
- D5: as recommended. ৳5 a minute.
- D6: as recommended. Three choices per meal, per trip, with a per-day change.
- D7: **changed.** A trip can be rated **any time during the trip** (from its first day) and after. One reminder card the day after it ends, no push.
- D8: as recommended. Everyone who went rates it.
- D9: **changed.** Item ratings are **good or bad** (👍 / 👎) with an **optional comment**, not "extraordinary/worst" highlights. **No sharing** of ratings to chats or profiles in this plan. The trip's overall rating stays five stars. Ratings are private to the traveller; using them for others' recommendations is a later decision.
- D10: as recommended. Catalog → places index → ORS geocoding (works at `https://api.openrouteservice.org/geocode/search` with the existing key; tested 2026-11-12) → pin.
- **D11 (new, from the audit): hotels without a price.** Pick a priced hotel with a real name, near the trip's stops, at the budget's level or the nearest level, first. If none is priced, keep the stay cost "unknown" and say so. Never guess a price. Owner's follow-up: ask the data collector for more room rates (only 82 of 937 hotels are priced).
