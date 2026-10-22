# Trip Planner Plan

**Updated:** 2026-10-19 (rewritten after step 3) · **Status:** all 11 steps done (2026-10-22); the final report is `docs/trip-planner/step-11-report.md`
**Goal:** a trip plan that fits what the traveller actually needs (their must-sees, their times, their budget), built for them, easy to change, with live information. It should be minimal and professional, use calm motion, and contain nothing that isn't needed.

**How we work:** one step per session.
- **Phone first:** each step is checked on the realme phone (no emulator).
- **Report:** each step ends with a report in `docs/trip-planner/step-N-report.md`, then waits for your approval.
- **Mockups first:** a step that changes how a screen looks starts with a mockup update on the design canvas (https://claude.ai/artifact/LQuSxSaKiQ8SAiZkHk6Wzf) before any code.
- **The rules from `vromon_android_app_agent_prompt.md` still apply:**
  - no git without permission;
  - secrets stay on the backend;
  - never hand-edit `android/`;
  - nothing is "working" until it's used on the phone;
  - no copied designs;
  - tests never change your own data (use the test accounts).

---

## 1. Principles (what every step is checked against)

1. **The traveller's needs come first.**
   - What they ask for is never silently dropped. A must-see they named, a time they gave and their budget are rules, not hints.
   - When something can't fit, the app says so and offers choices. It never quietly leaves it out.
2. **Ask little, decide well.**
   - Only "where" and "when" are required; everything else has a sensible default and can be changed later on the trip screen.
   - No expert settings up front.
3. **One screen per job.**
   - Planning a trip is a short flow; living with the plan is the trip screen.
   - No extra screens, tabs or settings that don't serve one of these.
4. **Minimal, but not bare:**
   - one accent colour (blue for anything you can tap);
   - vector icons, no emoji;
   - generous spacing;
   - plain words (no "constraints", "algorithm", "valid").
5. **Calm, natural motion**, used only where it explains something:
   - a lifted card, a list making room, a sheet settling, progress filling.
   - **Short:** 150–300 ms, spring easing.
   - **Accessible:** off when the phone's "remove animations" setting is on.
6. **Honest information:**
   - estimates say "about";
   - unknown prices say "price unknown";
   - live data shows its source and age;
   - the app never says a route is "safe".

## 2. Where we are

### Done (steps 1–3)

| Step | What it gave us |
|---|---|
| 1 · Mockups | The design language and 13 screens on the canvas; `docs/trip-planner/design-spec.md` |
| 2 · One trip screen | Map plus plan sheet, day tabs, day ribbon, stop cards, travel legs, free time, stop details, swipe to remove with Undo, read-only friend trips, Bangla digits |
| 3 · Rearranging | Drag and drop (within a day and to another day), stay ±15 min, "Keep this time", add a stop (suggestions or search), screen reader actions; meals only at open restaurants |

### What's still wrong for "the traveller's exact needs"

The new-trip flow is the old six-step form:
- **Day hours** are typed as text ("09:00").
- **"Max activities per day"** is a number field.
- **Must-see and skip are confusing:** tapping a place once makes it a must-see, tapping twice excludes it.

And there's no way to say:
- "**Day 1** at **sunset**, Inani Beach";
- "we **arrive at 14:00** on the first day" or "we **leave at 11:00** on the last day";
- "I'm **busy** Tuesday 18:00–21:00 (a wedding)".

If a must-see doesn't fit, the planner just leaves it out, and the user isn't told clearly.

**Other gaps:**
- Travel times are straight-line estimates.
- There's no live weather or traffic.
- The budget has no getting-there cost or local transport.
- The Trips tab is plain.
- There's nothing for the day itself.
- Only Cox's Bazar has data.

---

## 3. The new-trip flow: three short steps

Three steps are enough because the trip screen does the rest: every choice can be changed after the plan is built (steps 2–3).

```
1 Where & when ──► 2 Your style ──► 3 Your must-dos ──► (building, 2–5 s) ──► Trip screen
   required           optional          optional
```

- **Building is a transition, not a step:** a short animated progress, then the trip screen.
- **Steps 2 and 3 can be skipped.** "Build my plan" is on both, so someone in a hurry can build after step 1 or 2.

### Step 1 · Where & when (required)
- **Destination cards** with a photo.
- **Dates** on a range calendar, and **travellers** (− / +).
- **First and last day:**
  - "Arriving around **[14:00]**" on the first day, and "Leaving by **[11:00]**" on the last day.
  - Both are optional; the defaults are your usual day start and end.
- **Where from, and how:** bus, train, plane or car. This is used for the getting-there time and cost.

### Step 2 · Your style (optional)
- **Interests:** chips with icons; pick as many as you like.
- **Pace:** Relaxed / Balanced / Packed. This replaces "max activities per day".
- **Budget:** a total, with Budget / Comfort / Luxury presets, plus the per-person amount and the kind of hotel it buys.
- **Your day:** "Start around **9:00** · finish by **20:00**". Tapping either opens a time picker; no typed times.

### Step 3 · Your must-dos (optional)

This is where people say exactly what they need, in plain parts.

- **Must see:**
  - Pick places (search, or tap from a list with photos). Each one is shown as a card.
  - Each card can have "**Any time**" (default), "**Day 1 / Day 2 …**", and "**Morning / Afternoon / Sunset / Evening / exact time**".
  - Example: *Inani Beach · Day 1 · Sunset*.
- **Busy times** ("+ Add a time I'm busy"):
  - a day and a time window, with an optional label;
  - example: *Tue 20 · 18:00–21:00 · Wedding*;
  - the planner leaves that time free.
- **Skip:** places you don't want. These are a separate, clearly labelled list, not the "tap twice" trick.
- **Avoid crowds:** one switch.
- **Summary line:** before building, for example "**3 days · 2 travellers · ৳25,000 · 2 must-sees · 1 busy time**". Every part can be tapped to go back and edit it.

### What the planner does with them
- **Must-sees with a day and time** are placed first, at that time (opening hours permitting). The rest of the day is filled around them.
- **Busy times and the arrival/departure times** are blocked out.
- **If something can't fit**, it's never dropped silently. The building screen ends with a short message, for example "**Inani Beach at sunset doesn't fit on day 1:** it closes at 18:00", with choices:
  - "Put it on day 2";
  - "Any time instead";
  - "Leave it out".
- **After building, they stay as rules:**
  - must-sees with a time are shown with "Keep this time" already on (from step 3);
  - "New ideas for this day" and "make it cheaper" never remove a must-see.

---

## 4. Motion (where and how)

| Moment | Motion |
|---|---|
| Moving between new-trip steps | Content slides 24 px and fades (200 ms); the step bar fills |
| Picking a chip or a card | Scale 0.97 → 1 with a selection haptic (already in `PressableScale`) |
| Building the plan | The route line draws itself; each check appears as it really finishes (not a fake timer) |
| Plan opens | The sheet rises; the map eases to the day's stops |
| Reordering or adding a stop | **New:** the other rows glide to their new places (Reanimated layout transitions) instead of jumping |
| Drag | The card lifts (scale and shadow); the drop line appears; haptic ticks (done) |
| Live updates (weather or traffic changed) | The changed chip cross-fades; it never jumps or flashes |

All of it is off when "remove animations" is on, and no animation delays the user.

---

## 5. The remaining steps

### Step 4 · The new-trip flow, built around the traveller's needs (next)

**Design:** update the canvas first:
- the three steps with arrival/departure times, must-sees with day and time, and busy times;
- the "doesn't fit" message;
- the row glide animation.

Approve before code.

**Backend:**
- **Trip data:**
  - arrival time (first day) and departure time (last day);
  - must-sees with an optional day and time window (instead of the plain must-visit id list; old trips are converted);
  - busy times (day, start, end, label).
- **Both planners** (quick and optimiser):
  - must-sees with a time are placed first;
  - busy windows and the arrival/departure times are blocked;
  - pace maps to stops per day.
- **When something doesn't fit:** the generate response lists each one with the reason (closed then, day full, over budget), instead of dropping it.
- **"Fix it" choices:** move it to another day, make it "any time", or leave it out. Each re-plans only what it has to.
- **The validator** checks must-see times and busy windows.

**App:**
- A new `trip/new` with the three steps, the animated transitions and the summary line.
- The "doesn't fit" message after building, with the choices.
- **Trip details:** the trip screen's "Your preferences" becomes "**Your must-dos**". It can be edited there; changes re-plan.
- **Row glide:** rows glide when the order changes (from step 3's reorder and add).

**Checked on the phone:**
- **Five real requests:**
  1. A must-see on day 1 at sunset.
  2. Arriving at 14:00 on the first day.
  3. Busy Tuesday 18:00–21:00.
  4. A must-see that can't fit, and each of its three choices.
  5. Skipping steps 2 and 3.
- **The rest:** Bangla, the largest font, and TalkBack.
- **Automatic phone tests:** the Maestro new-trip flow is rewritten.

**Your decision:** none needed to start. The mockups come first.

### Step 5 · Real roads and travel times
- **Routing:** a routing service on the backend, behind a small interface:
  - **to start:** OpenRouteService (free key, OpenStreetMap roads);
  - **before launch:** self-hosted OSRM.
- **Travel:** legs get road distance, time and the road line on the map.
- **Modes:** walk, rickshaw, CNG or car, per leg, from a leg sheet. Rickshaw and CNG are labelled estimates.
- **Planning:** the planners, editing and the validator use the cached road times. Without routing, they fall back to straight line, labelled "estimate".
- **Getting there:** the trip's origin and mode become the first leg, with time and cost.
- **Your decision:** OpenRouteService account now, or go straight to self-hosted OSRM.

### Step 6 · Live conditions and warnings
- **Weather:** hourly, per stop and day (Open-Meteo, free).
- **Sea state** for beach and boat stops (Open-Meteo Marine). **Sunrise and sunset** times.
- **Traffic:**
  - **live:** a provider, but only if a test shows it covers Bangladesh;
  - **otherwise:** "usual traffic" factors, clearly labelled as not live.
- **Warnings on the stop they affect**, each with its reason, source and age, and an action ("Move to Tuesday" / "Keep"):
  - storms on a travel leg;
  - rough sea;
  - arriving after dark;
  - traffic making you miss a closing time.
- **Refresh:** cached on the backend; refreshed when the trip opens and every few minutes while it's open; readable offline with "updated X ago".
- **Your decision:** the traffic provider, and whether to spend money on one.

### Step 7 · Full budget and a weather-aware planner
- **Full budget:** getting there, stay (hotel × nights), food, tickets and local travel, each with a range.
  - **Estimates:** marked "≈".
  - **Warning:** the meter warns before the plan goes over.
- **Ways to save** that actually apply: a cheaper hotel, skipping a paid stop, rickshaw instead of CNG. Each shows the saving and is applied in one tap, with Undo.
- **A weather-aware planner:**
  - outdoor stops avoid rainy hours where possible;
  - viewpoints go near sunset when you picked photography;
  - must-sees and pinned stops never move.
- **A one-line summary per day**, from a fixed template ("Beach morning, seafood lunch, sunset boat ride"). An AI-written version only if you want it later.

### Step 8 · Trips tab
- **Next trip:** a hero card with a countdown, the destination's weather and "Open plan".
- **Upcoming and past:** compact cards; a past trip shows its photos and "Mark as visited".
- **Restyled:** the stats card matches.
- **No trips yet:** "Plan your first trip".

### Step 9 · Today mode (on the trip)
- **The day itself:** on a trip day, the trip screen opens on **Now / Next**, with "**Leave by 14:05**" (from road time and traffic) and one-tap directions in Google Maps.
- **Local reminders:** "Leave in 10 minutes", and a weather change the evening before. These work without a push server.
- **Running late?** One tap shifts the rest of the day. Must-sees and pinned stops are protected; it shows exactly what moved or dropped, with Undo.
- **Optional foreground location**, only if you approve it:
  - for "leave by" from where you are;
  - never stored or shared;
  - added to the privacy policy.

### Step 10 · More destinations
- **Import:** a pipeline for the first 10 Bangladesh destinations (your choice):
  - places from OpenStreetMap;
  - descriptions from Wikivoyage, with attribution;
  - hand-checked hours, prices and hotels.
- **Unknown stays unknown:** missing prices are marked unknown, never guessed.
- **Data report:** a quality report per destination.
- **Your decision:** which destinations first, and who checks prices and hours.
- *This step can move earlier, after step 5, if friends need other places sooner.*

### Step 11 · Hardening
- **Tests:** backend tests for each new rule; app tests; Maestro for the whole journey (new trip with must-dos → rearrange → live warnings → Today).
- **Speed:** the trip screen opens in under 1 s from cache; drag stays smooth (measured with `gfxinfo`).
- **Offline:** the last plan, routes and conditions are readable.
- **Accessibility:** TalkBack covers everything, plus large text and contrast.
- **Docs:** the decisions record, the privacy and Data safety updates, and a final report.

---

## 6. Decisions (with my recommendation)

| # | Question | Recommendation | Needed by |
|---|---|---|---|
| 1 | Approve the step 4 mockups | — | Step 4 code |
| 2 | Routing provider | OpenRouteService now; self-hosted OSRM before launch | Step 5 |
| 3 | Live traffic provider and spend | Test Bangladesh coverage first; otherwise "usual traffic" only | Step 6 |
| 4 | AI-written day summaries | No for now; templates are clear and free | Step 7 |
| 5 | Optional foreground location in Today mode | Yes, opt-in, never stored | Step 9 |
| 6 | First destinations, and who checks prices and hours | Your list | Step 10 |
| 7 | "Describe your trip in your own words" (AI turns a sentence into must-dos you confirm) | Not now; consider after step 10 if people struggle with step 3 | Later |

## 7. Not doing (on purpose)

- **Social planning** (planning a trip together, voting on places). It's a different product; it can come later if you want it.
- **Booking or paying inside the app.** We show costs and link out.
- **Showing the planner's settings** (which planner, scores, solver details). The plan is the product, not the planner.
- **Gamification, badges, feeds.**

## 8. Honest limits

- **Live traffic in Bangladesh may be thin.** We test before relying on it, and label anything that isn't live.
- **"Warnings" come from known data only.** The app never promises that a route is safe.
- **Rickshaw and CNG times are estimates** built from road distance and local speeds.
- **The planner is only as good as the place data.** Today that's Cox's Bazar; step 10 adds more, and that needs real checking.
- **Server push reminders** need EAS and Firebase (open since Phase 8). Today mode uses local reminders, which need neither.
