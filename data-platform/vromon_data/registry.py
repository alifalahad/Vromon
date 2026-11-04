"""The source registry: source-registry/sources.yaml, mirrored into the data_sources table."""

from __future__ import annotations

from typing import Any

import yaml

from vromon_data.paths import REGISTRY_FILE

REQUIRED = ("source_id", "source_name", "organization", "source_type", "access_method",
            "terms_review_status", "reliability_class", "recommended_use")
TERMS = {"not_reviewed", "open_license", "permission_required", "reference_only", "do_not_use"}
RELIABILITY = {"official_government", "official_operator", "direct_human", "licensed_provider",
               "community_geospatial", "reputable_secondary", "unverified_user", "ai_extracted"}
USES = {"production", "enrichment", "discovery_only", "reference_only", "do_not_use"}


def load(path=REGISTRY_FILE) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f)["sources"]


def validate(sources: list[dict[str, Any]]) -> list[str]:
    """Problems with the registry, as messages (empty: valid)."""
    problems: list[str] = []
    seen: set[str] = set()
    for s in sources:
        sid = s.get("source_id", "?")
        for key in REQUIRED:
            if not s.get(key):
                problems.append(f"{sid}: missing {key}")
        if sid in seen:
            problems.append(f"{sid}: duplicate source_id")
        seen.add(sid)
        if s.get("terms_review_status") not in TERMS:
            problems.append(f"{sid}: unknown terms_review_status {s.get('terms_review_status')!r}")
        if s.get("reliability_class") not in RELIABILITY:
            problems.append(f"{sid}: unknown reliability_class {s.get('reliability_class')!r}")
        if s.get("recommended_use") not in USES:
            problems.append(f"{sid}: unknown recommended_use {s.get('recommended_use')!r}")
        if s.get("fetch_policy", "robots") not in ("robots", "usage_policy"):
            problems.append(f"{sid}: unknown fetch_policy {s.get('fetch_policy')!r}")
        if s.get("fetch_policy") == "usage_policy" and not s.get("usage_policy_url"):
            problems.append(f"{sid}: usage_policy without usage_policy_url")
        # Production use needs settled terms
        if s.get("recommended_use") == "production" and s.get("terms_review_status") in ("permission_required", "do_not_use"):
            problems.append(f"{sid}: production use with terms {s['terms_review_status']}")
    return problems


def by_id(sources: list[dict[str, Any]] | None = None) -> dict[str, dict[str, Any]]:
    return {s["source_id"]: s for s in (sources if sources is not None else load())}
