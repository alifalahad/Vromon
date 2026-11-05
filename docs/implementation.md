# Implementation notes

Changes from testing the app, put in the order they'll be built. Screenshots are in
[implementation-screenshots/](implementation-screenshots/) and are referred to by number.

| No. | Screenshot | Shows |
|---|---|---|
| 1 | [1.png](implementation-screenshots/1.png) | A friend's app (another project): a map card with a **Full Map** button; road names (Teligati Road) easy to read |
| 2 | [2.png](implementation-screenshots/2.png) | The same app, full-screen map: a clean street map, nothing covering the road names |
| 3 | [3.png](implementation-screenshots/3.png) | Vromon: Rangamati's rendered district map, with English labels badly placed and the "Tap to zoom" label over the title |
| 4 | [4.png](implementation-screenshots/4.png) | Vromon Map tab: the "Your next trip" card to remove |
| 5 | [5.png](implementation-screenshots/5.png) | Vromon Map tab: the top-right button to move down; the trip card crossed out |

---

## 1. Map tab layout

1. **Remove the "Your next trip" card** from the Map tab (4, 5).
2. **Move the top-right layers button down** to the space the card leaves (5).
3. **A profile picture button in the top-right corner**, showing the user's photo (or initials).
   Tapping it opens Settings.
4. **Remove Settings from the bottom navigation bar.** The bar becomes Map · Explore · Trips · Friends.

## 2. Maps: street map, satellite, Full Map, clear routes

1. **Street map: OpenStreetMap. Satellite: Esri.** The street map should look like 1 and 2: light,
   with readable road and place names.
2. **A very smooth transition** when switching between Map and Satellite (a cross-fade, no flash or reload).
3. **A "Full Map" button** on map cards (like 1): tapping it opens the map full screen (like 2).
4. **Clear routes:** the route must not be a thick line that hides road names. A route line should
   be thin enough, or drawn under the labels, so names like "Teligati Road" stay readable (1, 2).

## 3. Rendered district maps (128)

1. **Fix the text on the 128 rendered maps** (64 districts × English and Bangla). On almost every
   map the English labels are badly placed: overlapping, cut and crowded (3). Some Bangla labels
   have the same problem. Check every map and fix the label placement.
2. The "Tap to zoom, save or share" label covers the map's title (3). (Already shrunk to an icon in
   the code; needs the next APK build.)

## 4. Trip planning: data

1. **Kuakata and Sreemangal still show "Not checked yet".** Add real, reviewed data for both.

## 5. Trip planning: getting there from where you are

1. **Plan the trip from the user's present location.** Build a clear route from where they are to
   the trip's places, using whatever the journey needs: plane, car, bus, train, launch, boat and so on.
   Every leg gets full detail.
2. **Ask about transport when the trip is first planned.** The user picks one or several kinds of
   transport, and the planner uses those first.
3. **Or suggest by budget:** which transport to take on each part of the journey, with its fare.
4. **Timetables for planes and trains,** since those run on fixed schedules.
5. **Remove the current bus / train / car / plane box.** It doesn't work and isn't the wanted
   design; items 2 and 3 replace it.

## 6. Trip planning: budget

1. **The current budget looks random and isn't realistic.** Replace it with an AI estimate:
   a retrieval (RAG) pipeline over the real data (fares, room rates, market food prices, entry
   fees), and an LLM (Gemini; the owner will provide the key) that suggests a feasible budget from it.
2. **Keep the manual edit option** that exists now.

## 7. Trip planning: "How was this plan?" rating

1. **Redesign the plan rating.** It looks cheap and unprofessional; it should be better organised
   and look different.
