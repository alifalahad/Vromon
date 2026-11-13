"""
Text handling: Unicode NFC for storage, and match keys for finding the same name
written differently (Bangla or Latin script, old or new spelling).

Stored text is only NFC-normalized and trimmed. Match keys are never shown; they
transliterate Bangla to Latin and fold common spelling variants so that
"শাহজালাল" ~ "Shah Jalal" and "Chittagong" ~ "Chattogram" land close together
for fuzzy comparison. A close key is a reason for a person to look, never a merge.
"""

from __future__ import annotations

import re
import unicodedata

# The name helpers live in the backend (app/core/names.py), so search there and the data platform here
# fold names the same way. Re-exported for the connectors.
from app.core.names import (  # noqa: F401
    bn_to_latin,
    clean,
    match_key,
    name_similarity,
    place_types,
)


def slugify(value: str) -> str:
    s = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"
