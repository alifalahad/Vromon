# The five features, as the traveller sees them

Every choice here is **optional**. A traveller who answers nothing gets today's behaviour: a hotel picked by their budget, restaurants for every meal, and the search they know. Nothing becomes a required question.

---

## F1. Where you stay

**Why:** not everyone sleeps in a hotel. Many Bangladeshi travellers stay with relatives or friends, some only do day trips from home, and some stay in one place for the whole trip. Today Vromon always assumes a hotel and always charges for it.

**What the traveller can choose, per night:**

| Choice | Cost | Where the day starts and ends |
|---|---|---|
| **A hotel** (default; Vromon suggests one by the budget level, or the traveller picks one) | the hotel's price × nights × rooms, as today | the hotel |
| **With family or friends** | none | the place they pick on the map or by searching an area, with an optional name ("Uncle's house") |
| **No night here (day trip)** | none | the trip's start point (their home or wherever "Getting there" starts) |
| **Decide later** | shown as "not chosen yet", not guessed | the destination's centre, as an estimate |

- One choice can cover the whole trip ("All nights: with family"), or each night can differ ("Nights 1–2: hotel in Khulna, night 3: with friends in Mongla").
- The choice is asked once, as one row in the New trip flow, and can be changed any time on the trip screen.

**The way back, on the map and in the plan:**
- Each day begins at that night's stay and ends back there. The last stop is followed by a row: **"Back to Hotel Castle Salam · 25 min · ৳80"**.
- On the day map, the stay is a pin of its own (a bed icon; a house icon for family/friends), and the way back is drawn like the other legs.
- The way back counts toward "finish by". If the day finishes at 20:00, you are back at 20:00, not leaving the last stop at 20:00.
- On a day you move from one stay to another, the day starts at the first and ends at the second.

**Privacy:** a family or friend's home is private. Only the trip's owner sees its pin and name. Friends who view the trip and trip-room members see "Staying with family" and no location.

---

## F2. Stay advisor: a better place to sleep for later nights

**Why:** "I stayed in the same place for days 1 and 2, but for day 3 another place may cost less and be closer." Example: in Khulna, the Sundarbans day starts from Mongla. A night in Mongla can save a 2-hour drive each way and be cheaper than a city hotel.

**What the traveller sees:**
- A card in the plan, just above the day it's about:
  > **Sleep in Mongla for night 3?**
  > Hotel Pashur, ৳1,800 a night instead of ৳3,500. **Saves ৳1,700 and 1 h 50 min on the road**, one extra check-out and check-in.
  > [Switch] [Not now] [Don't suggest this]
- The same suggestion appears in the budget's **Ways to save**.
- **Switch** changes the stay for those nights. The affected days are re-timed around the new start and end, and pinned stops stay where they are.
- **Not now** hides the card until the plan changes. **Don't suggest this** hides that suggestion for good, unless its saving grows a lot (D4).
- Until the traveller decides, the card stays, and its numbers update when the plan changes. That's what "keep informing" means here: no notifications, no nagging, just the card with current numbers.

**How "worth it" is judged:** money saved, road time saved and the hassle of moving are always shown together, as numbers. A move is suggested only when it clearly wins (thresholds in D4). Hopping hotels every night is never suggested unless the time saving is very large.

---

## F3. Meals

**Why:** some travellers bring food (tiffin, packed lunch), some eat at the place they stay (hotel breakfast, family dinners). By default, Vromon should still suggest the best places to eat.

**Per meal (breakfast, lunch, dinner), for the whole trip or one day:**

| Choice | What the plan does | Cost |
|---|---|---|
| **Best places to eat** (default) | picks a good restaurant open at that time, near the route, as today | the restaurant's meal cost × travellers |
| **I'll bring my own** | a short "Packed lunch" break (30 min) at the right time, near where the traveller will be (a scenic or quiet stop when there is one), no restaurant | 0, or an amount per person the traveller enters |
| **Where I stay** (breakfast and dinner only) | breakfast before leaving the stay, dinner after getting back, no trip to a restaurant | 0 ("included") |

- When the stay is "with family or friends", the app offers once: "Have breakfast and dinner there?" It's one tap, not automatic.
- Even with "bring my own", a day's sheet still has "Places to eat nearby" for a change of mind.

---

## F4. Rate your trip

**Why:** during or after a trip, travellers want to say how it went, and sometimes to say that one place, meal or hotel was good or bad and why. Making it mandatory or long makes it a chore. (Decisions D7, D9.)

**What the traveller sees:**
1. **From the trip's first day, and any time after,** the bottom of the trip's plan shows **"How was your trip?"** with five stars and an optional comment. One tap is enough, and it can be changed later. The existing **"Rate this plan"** (the plan's quality, before the trip) stays as it is.
2. **Optional: "Rate things one by one"** opens a list by day: the places, the meals, the stays, getting there. Each can be marked **Good 👍** or **Bad 👎**, with an **optional comment** ("The boat was late and overcrowded"). **"Mark all good" / "Mark all bad"** sets every item at once; the traveller then changes the few that differ. Items left alone stay unrated.
3. Ratings are **private** to the traveller. They aren't shared to chats or profiles, and they aren't used for anyone else's recommendations in this plan.
4. A **one-time card** on the Trips tab the day after a trip ends: "Rate your trip to Khulna?" It's dismissible, never a push notification, and never asked twice.

---

## F5. Search anything in free time

**Why:** in free time, travellers want to go somewhere that isn't a tourist spot, like a college, a relative's office, a market or a hospital. Today the search only knows the destination's tourist list and says nothing when there's no match.

**What the traveller sees** when they type in the "Add a stop" sheet (for example "BL college" in Khulna):
1. **Vromon's places** that match, first.
2. **Other places Vromon knows** nearby: restaurants, cafés, hotels, sights in the next district.
3. **Every other kind of place** from open map data (colleges, schools, offices, banks, markets, hospitals, mosques, temples…). These are labelled "Not checked by Vromon" and have no prices or hours.
4. **Addresses and areas** ("Sonadanga", "KDA Avenue") from a geocoding service.
5. Results are ranked by **how well they match and how close they are** to where the traveller will be at that time. The distance is shown ("2.4 km from Rupsha Bridge").
6. **Never a dead end.** If the name matches nothing, the sheet shows the closest spellings ("Did you mean Brajalal College?"), places of the kind they seem to want ("Colleges near you"), and **"Put a pin on the map"**, which adds a stop they name themselves.

- A stop added from outside Vromon's list works like any other: travel time, map pin, Today mode. It stays **private to the trip**; other travellers aren't offered it.
- Optional: "Suggest this place to Vromon" sends it to the data review queue.
