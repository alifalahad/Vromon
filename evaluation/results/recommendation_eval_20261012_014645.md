# Recommendation ranking evaluation

Run 2026-10-11T19:46:45.938376+00:00 · 8 profiles · 25 places · random baseline = mean of 30 seeds

> Relevance is a proxy (interest/tag overlap), not human judgment. See the script docstring.

| Ranker | P@5 | P@10 | nDCG@10 | afford@10 | diversity@10 | excluded | Deterministic |
|---|---|---|---|---|---|---|---|
| vromon_weighted | 0.975 | 0.812 | 0.993 | 0.938 | 0.6 | 0.0 | True |
| ablation_no_interest | 0.625 | 0.512 | 0.493 | 0.988 | 0.65 | 0.0 | True |
| ablation_no_budget | 0.975 | 0.812 | 0.993 | 0.925 | 0.587 | 0.0 | True |
| ablation_no_style_activity | 0.975 | 0.825 | 1.0 | 0.925 | 0.562 | 0.0 | True |
| baseline_rating_only | 0.6 | 0.537 | 0.455 | 0.875 | 0.512 | 0.0 | True |
| baseline_popularity_only | 0.525 | 0.45 | 0.409 | 0.95 | 0.625 | 0.0 | True |
| baseline_random | 0.446 | 0.453 | 0.36 | 0.928 | 0.671 | 0.0 | n/a (seeded mean) |

Crowd share in top-5 for the `avoid_crowds_nature` profile (lower is better):

| Ranker | crowd@5 |
|---|---|
| vromon_weighted | 0.0 |
| ablation_no_interest | 0.0 |
| ablation_no_budget | 0.0 |
| ablation_no_style_activity | 0.0 |
| baseline_rating_only | 0.0 |
| baseline_popularity_only | 0.4 |
| baseline_random | 0.227 |
