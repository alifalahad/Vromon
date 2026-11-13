# Step 8: Hardening, the full check, and the friends' APK

**Goal:** everything from steps 1–7 works together, in Bangla and with large text, on a release build, and the friends' APK has it.
**Depends on:** steps 1–7.

## Prompt

```
Follow docs/trip-upgrades/rules.md and read every report in docs/trip-upgrades/reports.

1. Together: one test trip as A that uses everything:
   - nights 1–2 at a hotel, night 3 with family, a Sundarbans-style day where the stay advisor fires;
   - packed lunch on day 2, breakfast and dinner where you stay on day 3;
   - a stop from "search anything" and a pinned spot;
   - a review with a few good/bad item ratings and comments (on a test-account trip whose dates have started).
   Check the plan, the map, Today mode, the budget and the AI budget all agree. List any mismatch, fix it, and re-check.
2. Bangla: switch the app to Bangla and walk every new screen; no English left, Bangla digits, nothing cut off.
3. Large text (font scale 1.6 via adb, as in the friends-chat step 10): every new sheet and card still works.
4. Release build of the dev app (rules.md): open the trip 10 times, open each new sheet, switch stays, add a searched
   stop. Nothing invisible (the GLSurfaceView lesson), nothing slow (time the search on the phone).
5. Maestro: new flows 13-stay-and-meals.yaml, 14-search-anything.yaml, 15-rate-trip.yaml (as A), added to flowsOrder
   by name; run the whole suite on the phone in the background, and fix what fails. Report the result.
6. Performance: the itinerary, route, stay-suggestions and search endpoints' timings on the real database copy; the
   database size after the places index.
7. Docs: docs/architecture.md (the new tables and endpoints), docs/feature-inventory.md, the data platform's README
   (the overture_pois connector).
8. The friends' APK: rebuild it with the commands in docs/sharing-with-friends.md ("Building the friends' APK again"),
   keep the previous one as a dated .bak, install it on the owner's phone, and check (read-only, through the share)
   that an existing trip opens, shows its stay, and that search works. Restart the share if its backend code changed.

Write reports/step-8-report.md with the full test numbers (backend, mobile, data platform, Maestro), update the Status
table, give the git commands, stop.
```

## Done when
- All test suites and the Maestro suite pass on the phone, and Bangla, large text and the release build check out.
- The friends' APK has the new features, and the share serves it.

## The owner checks
- Plan a real trip the way you would: stay with relatives for one night, bring lunch one day, search for a non-tourist place, and after the trip, rate it.
