# Validator fault-injection evaluation

Run 2026-10-11T19:48:42.606684+00:00 · 14 generated itineraries (7 scenarios × 2 schedulers)

Clean itineraries flagged with hard violations (false positives): **0 / 14**

| Fault | Expected code | Injected | Detected |
|---|---|---|---|
| overlap | TIME_OVERLAP | 14 | 14 |
| outside_hours | OUTSIDE_OPENING_HOURS | 14 | 14 |
| excluded | EXCLUDED_PLACE_SCHEDULED | 14 | 14 |
| duplicate | DUPLICATE_PLACE | 14 | 14 |
| over_limit | ACTIVITY_LIMIT_EXCEEDED | 14 | 14 |
| missing_must | MUST_VISIT_MISSING | 14 | 14 |
| over_budget | DAILY_BUDGET_EXCEEDED | 14 | 14 |

Overall detection: **98 / 98**
