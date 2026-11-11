"""
The Vromon curated reference tables (source `vromon_curated`), read from the files that
already define them for the app, so there is one copy:
  - districts: BD_DISTRICTS in scripts/geo/prepare.py (geoBoundaries name → official English, Bangla)
  - divisions: the Bangladesh rows of data/geo/regions.json (ISO 3166-2 code, English, Bangla)
"""

from __future__ import annotations

import ast
import json
from functools import lru_cache

from vromon_data.paths import REPO_DIR

PREPARE_PY = REPO_DIR / "scripts" / "geo" / "prepare.py"
REGIONS_JSON = REPO_DIR / "data" / "geo" / "regions.json"


@lru_cache
def districts() -> dict[str, tuple[str, str]]:
    """geoBoundaries ADM2 shapeName → (official English name, Bangla name)."""
    tree = ast.parse(PREPARE_PY.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.AnnAssign) and getattr(node.target, "id", None) == "BD_DISTRICTS":
            return ast.literal_eval(node.value)
    raise LookupError("BD_DISTRICTS not found in scripts/geo/prepare.py")


@lru_cache
def divisions() -> dict[str, tuple[str, str]]:
    """ISO 3166-2 code → (official English name, Bangla name without the word বিভাগ)."""
    rows = json.loads(REGIONS_JSON.read_text(encoding="utf-8"))
    out = {}
    for r in rows:
        if r["country_iso2"] == "BD":
            bn = (r.get("name_bn") or "").removesuffix("বিভাগ").strip() or None
            out[r["code"]] = (r["name"], bn)
    return out
