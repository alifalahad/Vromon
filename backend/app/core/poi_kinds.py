"""
Kinds of places (poi-kinds.yaml next to this file): Overture's categories → Vromon's friendly kinds, with
the words people search with in English and Bangla. Read by the data platform's places index (step 5:
overture_pois sets each place's kind) and by search (step 6: "college", "কলেজ", "atm", "bazar" say what
kind of place the traveller wants). It lives in the backend because search reads it at run time; the data
platform imports the backend.
"""

from __future__ import annotations

import re
import unicodedata
from functools import lru_cache
from pathlib import Path

import yaml

KINDS_FILE = Path(__file__).with_name("poi-kinds.yaml")
_BN = re.compile(r"[ঀ-৿]")


def _nfc(s: str) -> str:
    return unicodedata.normalize("NFC", s)


class KindMap:
    """Overture's category → Vromon's kind, made specific by a word in the name when the kind is generic."""

    def __init__(self, data: dict):
        self.skip = set(data.get("skip") or [])
        self.by_category: dict[str, str] = {}
        self.generic: set[str] = set()
        self.words: dict[str, dict[str, list[str]]] = {}
        self._name_res: dict[str, list[re.Pattern]] = {}
        self.beats: dict[str, set[str]] = {}       # kind → the kinds its name words replace
        for kind, spec in (data.get("kinds") or {}).items():
            for other in spec.get("beats") or []:
                self.beats.setdefault(other, set()).add(kind)
            for c in spec.get("categories") or []:
                self.by_category[c] = kind
            if spec.get("generic"):
                self.generic.add(kind)
            w = spec.get("words") or {}
            self.words[kind] = {"en": [x.lower() for x in w.get("en") or []], "bn": [_nfc(x) for x in w.get("bn") or []]}
            self._name_res[kind] = [self._word_re(x) for x in spec.get("name_words") or []]
        self.refine_order = [k for k in data.get("refine_order") or [] if k in self._name_res]
        self.not_words = [_nfc(x.lower()) for x in data.get("not_words") or []]
        self.generic.add("other")

    @staticmethod
    def _word_re(word: str) -> re.Pattern:
        word = _nfc(word.lower())
        if _BN.search(word):
            return re.compile(re.escape(word))           # Bangla: any part of the name (বাজার in "বড়বাজার")
        return re.compile(r"(?<![a-z])" + re.escape(word) + r"(?![a-z])")

    def kind_of(self, category: str | None, *names: str | None) -> tuple[str | None, bool]:
        """(kind, mapped). None for a category that's skipped (lodging and food). `mapped` is False when
        the category is in no list (it becomes "other")."""
        if category in self.skip:
            return None, True
        kind = self.by_category.get(category or "")
        mapped = kind is not None
        kind = kind or "other"
        if kind in self.generic or kind in self.beats:
            text = _nfc(" ".join(n for n in names if n).lower())
            for phrase in self.not_words:
                text = text.replace(phrase, " ")
            # a generic kind takes the first kind its name names; a specific one only a kind that beats it
            allowed = self.refine_order if kind in self.generic else [k for k in self.refine_order if k in self.beats[kind]]
            for k in allowed:
                if any(p.search(text) for p in self._name_res[k]):
                    return k, mapped
        return kind, mapped

    def search_words(self) -> dict[str, str]:
        """Every word a search may use for a kind ("college", "কলেজ", "colleges") → the kind. A word two
        kinds share goes to the first listed."""
        out: dict[str, str] = {}
        for kind, w in self.words.items():
            for word in w["en"]:
                for form in (word, word + "s", word + "es"):
                    out.setdefault(form, kind)
            for word in w["bn"]:
                out.setdefault(word, kind)
        return out


@lru_cache(maxsize=1)
def kind_map() -> KindMap:
    with open(KINDS_FILE, encoding="utf-8") as f:
        return KindMap(yaml.safe_load(f))
