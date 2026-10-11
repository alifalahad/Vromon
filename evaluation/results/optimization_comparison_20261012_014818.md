# Heuristic vs CP-SAT comparison

Run 2026-10-11T19:48:18.437826+00:00 · OR-Tools 9.15.6755 · deterministic limit 5.0 · workers 8

| Scenario | Algorithm | Status | Valid | Hard | Acts | Score | Travel min | Late min | Must-visit | Gap | Time s | Repro |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| weekend_beach | heuristic | COMPLETED | True | 0  | 7 | 6.64 | 97.3 | 0 | 0/0 | – | 0.008 | True |
| weekend_beach | cpsat | OPTIMAL | True | 0  | 8 | 7.631 | 67.0 | 0 | 0/0 | 0.0 | 2.151 | True |
| culture_food_early | heuristic | COMPLETED | True | 0  | 12 | 8.453 | 190.1 | 75 | 0/0 | – | 0.009 | True |
| culture_food_early | cpsat | FEASIBLE | True | 0  | 14 | 9.549 | 94.0 | 0 | 0/0 | 0.0578 | 3.289 | True |
| adventure_long | heuristic | COMPLETED | True | 0  | 17 | 14.487 | 497.5 | 26 | 0/0 | – | 0.009 | True |
| adventure_long | cpsat | FEASIBLE | True | 0  | 20 | 16.153 | 361.0 | 0 | 0/0 | 0.1421 | 3.844 | True |
| relaxed_short_day | heuristic | COMPLETED | True | 0  | 3 | 2.948 | 22.0 | 51 | 0/0 | – | 0.005 | True |
| relaxed_short_day | cpsat | OPTIMAL | True | 0  | 3 | 2.896 | 25.0 | 0 | 0/0 | 0.0 | 0.154 | True |
| must_visit_mix | heuristic | COMPLETED | True | 0  | 6 | 5.76 | 84.5 | 35 | 3/3 | – | 0.004 | True |
| must_visit_mix | cpsat | OPTIMAL | True | 0  | 8 | 7.761 | 76.0 | 0 | 3/3 | 0.0 | 1.977 | True |
| budget_cap | heuristic | COMPLETED | True | 0  | 6 | 5.332 | 93.1 | 0 | 0/0 | – | 0.004 | True |
| budget_cap | cpsat | OPTIMAL | True | 0  | 8 | 6.554 | 22.0 | 0 | 0/0 | 0.0 | 2.704 | True |
| week_packed | heuristic | COMPLETED | True | 0  | 23 | 16.255 | 998.3 | 11 | 0/0 | – | 0.012 | True |
| week_packed | cpsat | FEASIBLE | True | 0  | 22 | 15.994 | 345.0 | 0 | 0/0 | 0.0049 | 5.108 | True |
| conflict_must_and_excluded | heuristic | COMPLETED | False | 1 EXCLUDED_PLACE_SCHEDULED | 3 | 3.241 | 82.0 | 0 | 1/1 | – | 0.003 | True |
| conflict_must_and_excluded | cpsat | INFEASIBLE | – | –  | – | – | – | – | – | None | 0.015 | True |
| conflict_closed_must_visit | heuristic | COMPLETED | False | 1 MUST_VISIT_MISSING | 2 | 2.039 | 2.2 | 0 | 0/1 | – | 0.003 | True |
| conflict_closed_must_visit | cpsat | INFEASIBLE | – | –  | – | – | – | – | – | None | 0.007 | True |

## Totals over feasible scenarios

```json
{
  "heuristic": {
    "scenarios": 7,
    "valid": 7,
    "hard_violations": 0,
    "activities": 74,
    "score": 59.875,
    "travel_min": 1982.8,
    "late_min": 198,
    "runtime_s": 0.05,
    "reproducible": 7
  },
  "cpsat": {
    "scenarios": 7,
    "valid": 7,
    "hard_violations": 0,
    "activities": 83,
    "score": 66.538,
    "travel_min": 990.0,
    "late_min": 0,
    "runtime_s": 19.23,
    "reproducible": 7
  }
}
```
