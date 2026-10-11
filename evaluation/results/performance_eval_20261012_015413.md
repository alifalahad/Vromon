# API latency (in-process)

Run 2026-10-11T19:54:12.998589+00:00 · macOS-27.0.1-arm64-arm-64bit · 8 CPUs · 5 repeats

| Endpoint | Median ms | Max ms |
|---|---|---|
| GET /places | 2.0 | 13.3 |
| POST /trips | 2.6 | 13.5 |
| generate heuristic 1d | 6.3 | 48.8 |
| generate cpsat 1d | 825.9 | 867.5 |
| generate heuristic 3d | 10.7 | 11.0 |
| generate cpsat 3d | 2535.2 | 5333.3 |
| generate heuristic 5d | 249.2 | 355.1 |
| generate cpsat 5d | 4044.4 | 7575.5 |
| GET itinerary (3d, incl. validation) | 3.9 | 12.7 |
| GET budget (3d) | 2.3 | 4.6 |
| regenerate day | 6.5 | 8.8 |
| GET alternatives | 6.8 | 7.5 |
| adapt energise | 7.9 | 17.1 |
| GET /rag/search (dummy embeddings) | 1.8 | 25.6 |
