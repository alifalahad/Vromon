"""
Building a destination's data from open sources (trip planner step 10). Pure
functions, no network: `scripts/import_destinations.py` fetches, these parse.

  - Wikivoyage (CC BY-SA 4.0): the destination's description and the
    See / Do / Buy / Eat / Drink / Sleep listings: name, coordinates, hours,
    price, description.
  - Wikidata (CC0): notable sights around the destination (museums, mosques,
    temples, parks, national parks, forts, lakes, waterfalls…) with their type.

Unknown stays unknown: a price or opening hours are only filled in when the
source states them in a form read here; otherwise they are None (unknown), never
guessed. Ratings aren't in either source, so they're unknown too.
"""

from __future__ import annotations

import math
import re
import unicodedata
from typing import Optional

# ---------------------------------------------------------------------------
# Wikivoyage listings
# ---------------------------------------------------------------------------

LISTING_SECTIONS = {"see": "see", "do": "do", "buy": "buy", "eat": "eat", "drink": "drink", "sleep": "sleep"}
_LISTING = re.compile(r"\{\{\s*(see|do|buy|eat|drink|sleep|listing)\s*\|", re.I)
_HEADER = re.compile(r"^(={2,3})\s*([^=]+?)\s*\1\s*$", re.M)


def _template_end(text: str, start: int) -> int:
    """Index just after the `}}` closing the template that opens at `start` (nested templates allowed)."""
    depth = 0
    i = start
    while i < len(text) - 1:
        pair = text[i:i + 2]
        if pair == "{{":
            depth += 1
            i += 2
            continue
        if pair == "}}":
            depth -= 1
            i += 2
            if depth == 0:
                return i
            continue
        i += 1
    return len(text)


def _fields(body: str) -> dict:
    """`name=… | lat=… | content=…` → dict (top-level pipes only)."""
    out: dict = {}
    depth = 0
    part = []
    parts = []
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1
            part.append(two)
            i += 2
            continue
        if two in ("}}", "]]"):
            depth -= 1
            part.append(two)
            i += 2
            continue
        if body[i] == "|" and depth == 0:
            parts.append("".join(part))
            part = []
        else:
            part.append(body[i])
        i += 1
    parts.append("".join(part))
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            out[k.strip().lower()] = clean_wikitext(v.strip())
    return out


def clean_description(s: str) -> str:
    """Wikidata's machine-made bits removed: "Lake in Bangladesh - Geonames ID = 1191424" → "Lake in Bangladesh"."""
    return re.sub(r"\s*[-–]\s*Geonames ID\s*=\s*\d+", "", s or "", flags=re.I).strip()


def clean_wikitext(s: str) -> str:
    """Plain text from a bit of wikitext: links, bold/italic, templates and tags removed."""
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>]*?/>|<ref.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", s)
    s = re.sub(r"\[https?://\S+\]", "", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"'{2,}", "", s)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", s).strip()


def listings(wikitext: str) -> list[dict]:
    """Every listing in the See/Do/Buy/Eat/Drink/Sleep sections, with its kind and fields."""
    # Level-2 sections only ("==See==", "==Get in=="): sub-headings like "===Museums===" stay inside them
    sections: list[tuple[int, str]] = [
        (m.start(), m.group(2).strip().lower()) for m in _HEADER.finditer(wikitext) if len(m.group(1)) == 2
    ]
    out = []
    for m in _LISTING.finditer(wikitext):
        start = m.start()
        section = next((name for pos, name in reversed(sections) if pos < start), None)
        kind = m.group(1).lower()
        if kind == "listing":
            # A plain {{listing}} takes the kind of its section; outside See…Sleep (a bus company in "Get in") it's left out
            kind = LISTING_SECTIONS.get(section or "")
        if kind is None:
            continue
        end = _template_end(wikitext, start)
        body = wikitext[m.end():end - 2]
        f = _fields(body)
        if not f.get("name"):
            continue
        f["kind"] = kind
        f["section"] = section
        out.append(f)
    return out


# ---------------------------------------------------------------------------
# Hours and prices, only when stated plainly
# ---------------------------------------------------------------------------

_TIME = r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|AM|PM|a\.m\.|p\.m\.)?"


def _to_min(h: str, m: Optional[str], ap: Optional[str]) -> Optional[int]:
    hh, mm = int(h), int(m or 0)
    ap = (ap or "").lower().replace(".", "")
    if ap == "pm" and hh < 12:
        hh += 12
    if ap == "am" and hh == 12:
        hh = 0
    if not (0 <= hh <= 24 and 0 <= mm < 60):
        return None
    return hh * 60 + mm


def parse_hours(text: Optional[str]) -> Optional[tuple[str, str]]:
    """
    "9AM-5PM", "09:00–17:00", "Sa-Th 10:00-17:00", "10 am to 6 pm" → ("09:00", "17:00").
    Anything else (several ranges that disagree, "sunrise to sunset", "varies") → None (unknown).
    "24 hours" / "open 24 hours" → ("00:00", "23:59").
    """
    if not text:
        return None
    t = text.strip()
    if re.search(r"\b24\s*(h|hours|hrs)\b|24/7", t, re.I):
        return "00:00", "23:59"
    ranges = re.findall(_TIME + r"\s*(?:-|–|—|to)\s*" + _TIME, t)
    found = set()
    for h1, m1, a1, h2, m2, a2 in ranges:
        if not a1 and a2 and a2.lower().startswith("p") and int(h1) < 12 and int(h1) > int(h2):
            a1 = "am"  # "9-5pm" style: the first is the morning
        if not a1 and a2:
            a1 = a2 if int(h1) <= int(h2) else ""
        s, e = _to_min(h1, m1, a1), _to_min(h2, m2, a2)
        if s is None or e is None or e <= s:
            continue
        found.add((s, e))
    if len(found) != 1:
        return None
    s, e = found.pop()
    return f"{s // 60:02d}:{s % 60:02d}", f"{min(e, 23 * 60 + 59) // 60:02d}:{min(e, 23 * 60 + 59) % 60:02d}"


_MONEY = re.compile(r"(?:BDT|Tk\.?|৳|taka)\s*([\d,]+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*([\d,]+))?|([\d,]+)(?:\s*(?:-|–|to)\s*([\d,]+))?\s*(?:BDT|Tk\.?|৳|taka)", re.I)


def parse_price(text: Optional[str]) -> Optional[tuple[float, Optional[float]]]:
    """
    The first price in taka, as (low, high or None): "Tk 20 (foreigners Tk 500)" → (20, None),
    "BDT 1,500-3,000" → (1500, 3000), "Free" → (0, None). No taka amount → None (unknown).
    """
    if not text:
        return None
    if re.fullmatch(r"\s*(free|free entry|free of charge|no charge|no entry fee)\.?\s*", text, re.I):
        return 0.0, None
    m = _MONEY.search(text)
    if not m:
        return None
    a = m.group(1) or m.group(3)
    b = m.group(2) or m.group(4)
    low = float(a.replace(",", ""))
    high = float(b.replace(",", "")) if b else None
    if high is not None and high < low:
        high = None
    return low, high


# ---------------------------------------------------------------------------
# What kind of place it is
# ---------------------------------------------------------------------------

# Wikidata types → the app's categories (the planner's interests)
WIKIDATA_TYPES: dict[str, str] = {
    "Q33506": "Culture",     # museum
    "Q207694": "Culture",    # art museum
    "Q32815": "Culture",     # mosque
    "Q44539": "Culture",     # temple
    "Q842402": "Culture",    # Hindu temple
    "Q5393308": "Culture",   # Buddhist temple
    "Q16970": "Culture",     # church
    "Q2977": "Culture",      # cathedral
    "Q1370598": "Culture",   # structure of worship
    "Q162875": "History",    # mausoleum
    "Q839954": "History",    # archaeological site
    "Q57821": "History",     # fortification
    "Q1785071": "History",   # fort
    "Q16560": "History",     # palace
    "Q879050": "History",    # manor house (zamindar houses)
    "Q4989906": "History",   # monument
    "Q5003624": "History",   # memorial
    "Q109607": "History",    # ruins
    "Q22698": "Family",      # park
    "Q22746": "Family",      # urban park
    "Q1107656": "Family",    # garden
    "Q167346": "Family",     # botanical garden
    "Q43501": "Family",      # zoo
    "Q194195": "Family",     # amusement park
    "Q46169": "Nature",      # national park
    "Q473972": "Nature",     # protected area
    "Q20268006": "Nature",   # wildlife sanctuary
    "Q4421": "Nature",       # forest
    "Q166735": "Nature",     # swamp
    "Q34038": "Nature",      # waterfall
    "Q23397": "Nature",      # lake
    "Q54050": "Nature",      # hill
    "Q8502": "Nature",       # mountain
    "Q2259780": "Nature",    # tea plantation
    "Q40080": "Beach",       # beach
    "Q1062074": "Scenic",    # viewpoint
    "Q570116": "Scenic",     # tourist attraction
    "Q330284": "Shopping",   # marketplace
    "Q11315": "Shopping",    # shopping centre
}

KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("Beach", ("beach", "sea beach", "sea shore")),
    ("Nature", ("national park", "forest", "falls", "waterfall", "lake", "hill", "tea estate", "tea garden", "wildlife",
                "sanctuary", "swamp", "haor", "river", "eco park", "sundarban")),
    ("History", ("fort", "clock tower", "clock", "palace", "zamindar", "rajbari", "ruins", "archaeolog", "mausoleum", "tomb", "memorial",
                 "monument", "shaheed minar", "bari", "kuthi")),
    ("Culture", ("museum", "mosque", "masjid", "temple", "mandir", "church", "pagoda", "kyang", "monastery", "dargah",
                 "mazar", "shrine", "gallery", "university")),
    ("Family", ("park", "garden", "zoo", "amusement", "planetarium")),
    ("Shopping", ("market", "bazar", "bazaar", "mall", "shopping", "handicraft")),
    ("Scenic", ("view", "viewpoint", "point", "bridge", "jetty", "ghat")),
]

VISIT_HOURS = {"Culture": 1.0, "History": 1.5, "Nature": 2.5, "Family": 1.5, "Beach": 2.0, "Scenic": 1.0, "Shopping": 1.5, "Adventure": 2.5}
ACTIVITY = {"Nature": "High", "Adventure": "High", "Beach": "Medium", "History": "Medium", "Culture": "Low", "Family": "Low",
            "Scenic": "Low", "Shopping": "Low"}


def category_for(name: str, text: str = "", kind: Optional[str] = None, wikidata_types: tuple[str, ...] = ()) -> str:
    """The app's category: from the Wikidata type when known, else words in the name and text, else the listing kind."""
    for q in wikidata_types:
        if q in WIKIDATA_TYPES:
            return WIKIDATA_TYPES[q]
    # The name says it best ("… Dargah", "… Falls"); the description only when the name doesn't
    for words in (name.lower(), text.lower()):
        for cat, keys in KEYWORDS:
            if any(k in words for k in keys):
                return cat
    if kind == "buy":
        return "Shopping"
    if kind == "do":
        return "Adventure"
    return "Culture"


def tags_for(category: str, name: str, text: str) -> list[str]:
    words = f"{name} {text}".lower()
    tags = {category}
    for tag, keys in (("Photography", ("view", "lake", "hill", "falls", "beach", "sunset", "tea")),
                      ("Religion", ("mosque", "masjid", "temple", "mandir", "church", "dargah", "pagoda", "shrine")),
                      ("History", ("historic", "century", "mughal", "british", "zamindar", "ancient", "liberation war")),
                      ("Wildlife", ("wildlife", "deer", "tiger", "bird", "monkey")),
                      ("Relaxation", ("lake", "garden", "park", "beach")),
                      ("Food", ("food", "restaurant", "pitha", "sweets"))):
        if any(k in words for k in keys):
            tags.add(tag)
    return sorted(tags)


# ---------------------------------------------------------------------------
# Merging the two sources
# ---------------------------------------------------------------------------

def km(a: tuple[float, float], b: tuple[float, float]) -> float:
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = math.radians(b[0] - a[0]), math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def norm_name(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\b(the|of|hazrat|shrine|masjid|mosque|museum|park|national|of)\b", " ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


_GENERIC = {"mosque", "masjid", "mazar", "mausoleum", "tomb", "temple", "mandir", "church", "museum", "park", "lake",
            "national", "the", "of", "and", "complex", "shahi", "jame", "hazrat", "shrine", "divisional", "sree", "shri"}


def _words(name: str) -> set[str]:
    n = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return {w for w in re.findall(r"[a-z]{3,}", n) if w not in _GENERIC}


def same_place(a: dict, b: dict) -> bool:
    """
    The same sight from two sources: the same Wikidata id; a similar name within 400 m; or, within
    150 m, two or more real words in common ("Mazar Khan Jahan Ali" / "Mausoleum of Khan Jahan Ali").
    """
    if a.get("wikidata") and a.get("wikidata") == b.get("wikidata"):
        return True
    na, nb = norm_name(a["name"]), norm_name(b["name"])
    dist = km((a["latitude"], a["longitude"]), (b["latitude"], b["longitude"]))
    if dist <= 0.4 and bool(na) and bool(nb) and (na in nb or nb in na):
        return True
    return dist <= 0.15 and len(_words(a["name"]) & _words(b["name"])) >= 2


def to_float(v) -> Optional[float]:
    try:
        f = float(str(v).strip())
    except (TypeError, ValueError):
        return None
    return f if math.isfinite(f) else None
