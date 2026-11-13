# Trip upgrades: where you stay, meals, smarter stays, rating, search anything

**Written:** 2026-11-12, against `main` at `f0ac797` plus the uncommitted work of 2026-11-11/12 (map by zoom, typed dates, pace slider, currency, interests sheet, switches, plan sheet fix, Bagerhat/Bogura data fix).
**Area:** the trip planner (backend `app/services/itinerary`, `app/services/budget`), the New trip screens (`mobile/app/trip/new.tsx`), the trip screen (`mobile/app/trip/[id].tsx`), Today mode, the data platform (`data-platform/`).

## Status

| Step | What | Prompt | Status | Report |
|---|---|---|---|---|
| 0 | Audit, test accounts, decisions D1–D10 (no app code) | [step-0](prompts/step-0-audit.md) | ✅ done 2026-11-12 (D7, D9 changed; D11 added) | [step-0-report.md](reports/step-0-report.md) |
| 1 | Backend: where you stay, night by night (hotel, family/friends, day trips), the way back each day | [step-1](prompts/step-1-stays-backend.md) | ✅ done 2026-11-12 (pytest 758) | [step-1-report.md](reports/step-1-report.md) |
| 2 | App: choose where you stay; the stay and the way back on the map and in the plan | [step-2](prompts/step-2-stays-app.md) | ✅ done 2026-11-12 (jest 602, pytest 760, phone + release check) | [step-2-report.md](reports/step-2-report.md) |
| 3 | Meals: restaurants by default, or your own food, or at the place you stay | [step-3](prompts/step-3-meals.md) | ✅ done 2026-11-12 (pytest 778, jest 615, phone) | [step-3-report.md](reports/step-3-report.md) |
| 4 | Stay advisor: "sleep somewhere else for nights 3–4?" when it saves money, time and hassle | [step-4](prompts/step-4-stay-advisor.md) | ✅ done 2026-11-12 (pytest 792, jest 623, phone) | [step-4-report.md](reports/step-4-report.md) |
| 5 | Data: an index of every kind of place in Bangladesh (colleges, offices, markets…) | [step-5](prompts/step-5-places-index.md) | ✅ done 2026-11-13 (179,490 places, spot check 20/20) | [step-5-report.md](reports/step-5-report.md) |
| 6 | Search anything in free time: best related results, never "nothing found" | [step-6](prompts/step-6-search-anything.md) | ✅ done 2026-11-13 (pytest 810, jest 638, phone; 9 bugs found and fixed) | [step-6-report.md](reports/step-6-report.md) |
| 7 | Rate your trip: overall stars, optional good/bad per item with a comment | [step-7](prompts/step-7-rate-trip.md) | ✅ done 2026-11-13 (pytest 825 with Postgres, jest 655, phone; CI-equivalent run) | [step-7-report.md](reports/step-7-report.md) |
| 8 | Hardening, Maestro, release-build checks, the friends' APK | [step-8](prompts/step-8-hardening.md) | ✅ done 2026-11-13 (pytest 825, jest 657, data platform 62, Maestro on the phone, release build, Bangla and 1.6×; 9 bugs fixed; the 3 CI failures fixed; friends' APK rebuilt) | [step-8-report.md](reports/step-8-report.md) |

## How to use this folder

1. Run **one step per session**. Open the step's file in `prompts/`, copy its **Prompt** block and paste it into the coding agent.
2. The agent reads [rules.md](rules.md) first, then the sections the prompt names, builds the step, checks it on the phone, writes `reports/step-N-report.md`, updates the Status table above, and **stops**.
3. You check the step on your phone ("The owner checks" in each prompt file), then say "approved, go to step N+1" or ask for fixes.
4. Nothing is committed or pushed by the agent. It ends with the git commands for you to run.

| File | What's in it |
|---|---|
| [features.md](features.md) | The five features as the traveller sees them, with examples |
| [design.md](design.md) | How things work today (with file references), and how they will work: data, API, planner, budget, search, privacy |
| [decisions.md](decisions.md) | D1–D10: the choices to confirm in step 0, each with a recommendation |
| [rules.md](rules.md) | Rules for every step, and how to test safely on the phone |
| [prompts/](prompts/) | One paste-ready prompt per step |
| `reports/` | Written by the steps |

## The five features in one line each

| # | Feature | In short |
|---|---|---|
| F1 | **Where you stay** | Per night: a hotel, family or friends (no cost), or no night at all (day trips). The day starts and ends there, and the way back shows on the map. |
| F2 | **Stay advisor** | If another place to sleep for later nights saves money and road time without much hassle, Vromon says so, with the numbers, until you decide. |
| F3 | **Meals** | Vromon keeps suggesting the best places to eat; you can say "I'll bring my own food" or "I'll eat where I stay", per meal and per day. |
| F4 | **Rate your trip** | During or after the trip: one tap (stars) for the whole trip; if you want, mark things one by one as good or bad, or all at once and then change a few, with an optional comment. Never required. |
| F5 | **Search anything** | In free time, search finds any place (a college in Khulna, an office, a market), not just the tourist list, ranked by how close and how relevant it is. Never a dead end. |

## Order and why

F1 comes first because F2 (moving to another stay) and F3 ("eat where I stay") build on knowing where you sleep each night. F2 needs both F1's stays and real travel times. F5 needs its data (step 5) before its search (step 6). F4 is independent and could move earlier if you want it sooner; it's last only because it's useful once trips have happened. Step 8 always comes last.

```
Step 0 ─► 1 ─► 2 ─► 3 ─► 4
          └──────────────────► 5 ─► 6
                                    7 (any time after 0)
                                          ─► 8
```
