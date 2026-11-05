# Plan: real destinations, district maps, road routes, profile photos, map colouring and sharing

Owner's requests of 5 Nov 2026, in the order they're built. Each part says what changes, where,
and how it's checked. Rules that hold throughout: no sample or invented data; every value keeps
its source; nothing a person reviewed is overwritten; the owner's own trips aren't changed
without asking.

## 1. Trip planning: every district, real data only

**Problem.** "Where to?" lists 11 destinations (10 imported from Wikivoyage, marked "Not checked
yet", and Cox's Bazar's demo set). The catalog already has 64 districts with 1,005 reviewed
attractions, 702 hotels and 1,353 restaurants near town centres, which the planner can't reach
because a trip must start from a `destinations` row.

**Change.**
- `vromon_data.publish.publish_destinations`: one destination per district that has at least one
  published attraction, named as the district (English), at its headquarters town (the GeoNames
  town of the same name inside the district, else the district's centre), with its division as
  `region_code`, `checked` (its places come from the reviewed catalog), sources listed.
  Existing destinations of the same name are reused, not duplicated (Kuakata and Sreemangal stay
  as towns).
- Then `publish_places` and `publish_service_places` fill them (as today, all districts now).
- Demo data: the Cox's Bazar seed rows (`source = curated`) are deleted where no trip uses them;
  rows a saved trip still points to stay hidden until that trip is re-planned (reported).
- Where a destination has catalog places, the older unreviewed imports (Wikivoyage / Wikidata
  rows, `checked = false`) are hidden, so a district shows only reviewed data; the destination
  is then `checked`. Destinations without catalog places keep them, still marked "Not checked yet".
- The seeder stops loading the Cox's Bazar demo file outside tests.

**Check.** Test for publish_destinations; "Where to?" on the phone lists all districts by
division; a new trip in a district that wasn't there before (e.g. Sunamganj) plans with real places.

## 2. Routes along roads

**Problem.** Legs appear as dotted straight lines. OpenRouteService answers (checked: all 15
legs of the Rajshahi trip get road lines now), but the app keeps a day's route forever once
fetched (`staleTime: Infinity`, saved on the phone), so a route fetched while routing failed
stays straight.

**Change.**
- App: a route with a leg missing its line is stale at once and fetched again (every 30 s while
  the map is open); only complete routes are kept.
- Backend: when one multi-stop request fails, ask leg by leg, so one bad stop doesn't make the
  whole day straight; the answer says which legs are still pending.
- Getting there (from the traveller's location) uses the road line too.

**Check.** Test for leg-by-leg fallback; on the phone every leg of a trip is drawn on roads.

## 3. District page: the rendered district map

**Problem.** The district page shows a live Esri 3D map; the owner wants the district maps the
data platform rendered (64 districts × English and Bangla = 128, published, 2160 × 2700 px:
Copernicus DEM relief, rivers, neighbours, attractions, legend, credits).

**Change.**
- Backend: `GET /explore/districts/{slug}/map?lang=en|bn&size=card|full`: the published render
  as a JPEG (1080 × 1350 for the page, full size for zoom), cached on disk, with its credits.
- App: the district page opens with that map (in the app's language); tap it for full screen
  with pinch-zoom; "Save" and "Share" for it. The Esri 3D map leaves this page (it stays on the
  trip map's 3D button).

**Check.** API test; on the phone Bandarban and Chapai Nawabganj show their maps in both languages.

## 4. Profile photo (ImgBB)

**Change.**
- Backend: `POST /me/avatar` (image upload, at most 5 MB, JPEG/PNG/WebP): sent to ImgBB with the
  server's `IMGBB_API_KEY` (never in the app), the URL saved as `users.avatar_url` (migration);
  `DELETE /me/avatar` removes it from the profile. `avatar_url` returned for me, friends, chats.
- App: Settings → Edit profile → "Add photo" / "Change photo" / "Remove" (camera or gallery,
  cropped square, resized to 512 px before upload); `Avatar` shows the photo wherever initials
  show now.
- Note: ImgBB images are public to anyone with the link.

**Check.** Test with ImgBB mocked; on the phone the photo shows on the profile, friends list, chats.
Needs the owner's ImgBB key in `backend/.env` (free at api.imgbb.com).

## 5. Travel map: districts when zoomed in, countries when zoomed out

**Change.**
- New place type `district` (Bangladesh's 64; code `BD-<slug>`), with bundled district outlines.
- Zoomed in on Bangladesh, each district is coloured by your status (lived / visited / want),
  and tapping one marks it, like regions today; zoomed out, countries are coloured (as now),
  a country counting as visited when any district or region in it is.
- Marking a district also counts its division; stats count districts.

**Check.** Tests for visits with districts and stats; on the phone tap a district, zoom out, see
Bangladesh coloured, zoom in, see that district coloured.

## 6. Export and share

**Change.**
- Map poster (exists, 1080 × 1920, story size): "Save to gallery" (expo-media-library) beside
  "Share"; Share hands the picture to Android's share sheet, where Instagram and Facebook offer
  Story, Feed or Messages.
- Friends comparison: a poster of the comparison map with both names and the counts each, with
  Save and Share.
- District map (part 3): Save and Share.
- expo-media-library is a native module: the development build is rebuilt and reinstalled.

**Check.** On the phone: save shows the picture in the gallery; share opens Instagram's story
editor with it.

## 7. Esri maps across trip planning

**Change.** The trip overview map (`TripMap`) gets the same Satellite and 2D / 3D buttons as the
day map; the trip route screen uses it; all trip maps credit Esri.

**Check.** On the phone, both trip maps switch satellite and 3D.

## 8. Test

Backend, data-platform and mobile test suites; type check and lint; each part on the phone.

## Status (5 Nov 2026, evening)

| Part | State | Checked on the phone |
|---|---|---|
| 1 Every district plannable | Done: 64 districts + Kuakata, Sreemangal (65); 63 checked; 13 demo rows deleted, 30 kept hidden for saved trips; 215 unreviewed imports hidden | "Where to?" lists 65 |
| 2 Road routes | Done: incomplete routes refetched every 30 s; leg-by-leg fallback | Rajshahi trip: all 15 legs get road lines from the server |
| 3 District map renders | Done: 128 published renders served as JPEG (card / full), full screen with zoom, English / Bangla | Bandarban: map, full screen, Save, Share |
| 4 Profile photos (ImgBB) | Done; key set in backend/.env (git-ignored); a test upload to ImgBB succeeded | Upload screen not tried on the phone (it opens your gallery) |
| 5 Districts on the travel map | Done: globe = countries coloured from what you marked; zooming in (3.8 → 4.6) fades them into only your marked districts and divisions; a country marked with nothing inside keeps its colour | Chandpur alone coloured close up; Bangladesh coloured on the globe |
| 6 Export and share | Done: poster Save + Share; friends comparison poster; district map Save + Share. Saved pictures land in DCIM (write-only access) | Save: in the gallery; Share: Facebook Story offered |
| 7 Esri in trip planning | The trip screen's day map is the trip-planning map (Esri, Satellite, 3D); TripMap is unused | Yes |

Done since: the 18 saved trips that used demo or hidden rows were re-planned with real data, and the last 30 demo rows deleted (none left).
