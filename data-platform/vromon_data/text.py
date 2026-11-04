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

from rapidfuzz import fuzz

# NFC keeps ড় and য় decomposed (they are composition exclusions), so two sources
# that look identical compare equal only after normalizing both.


def clean(value: str | None) -> str | None:
    """NFC, trimmed, inner whitespace collapsed. None stays None; a blank string becomes None
    (the raw record keeps the original, so blank and missing stay distinguishable there)."""
    if value is None:
        return None
    s = " ".join(unicodedata.normalize("NFC", str(value)).split())
    return s or None


def slugify(value: str) -> str:
    s = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "x"


# --- Bangla → Latin (for match keys only) ------------------------------------------------

_VOWELS = {"অ": "o", "আ": "a", "ই": "i", "ঈ": "i", "উ": "u", "ঊ": "u", "ঋ": "ri", "এ": "e", "ঐ": "oi", "ও": "o", "ঔ": "ou"}
_SIGNS = {"া": "a", "ি": "i", "ী": "i", "ু": "u", "ূ": "u", "ৃ": "ri", "ে": "e", "ৈ": "oi", "ো": "o", "ৌ": "ou"}
_CONS = {
    "ক": "k", "খ": "kh", "গ": "g", "ঘ": "gh", "ঙ": "ng", "চ": "ch", "ছ": "chh", "জ": "j", "ঝ": "jh", "ঞ": "n",
    "ট": "t", "ঠ": "th", "ড": "d", "ঢ": "dh", "ণ": "n", "ত": "t", "থ": "th", "দ": "d", "ধ": "dh", "ন": "n",
    "প": "p", "ফ": "f", "ব": "b", "ভ": "bh", "ম": "m", "য": "j", "র": "r", "ল": "l", "শ": "sh", "ষ": "sh",
    "স": "s", "হ": "h", "ড়": "r", "ঢ়": "rh", "য়": "y", "ৎ": "t", "ং": "ng", "ঃ": "h", "ঁ": "",
}
_HALANT = "্"
_NUKTA = "়"
_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")


def bn_to_latin(s: str) -> str:
    s = unicodedata.normalize("NFC", s).translate(_DIGITS)
    # Re-compose the nukta letters for lookup
    s = s.replace("ড" + _NUKTA, "ড়").replace("ঢ" + _NUKTA, "ঢ়").replace("য" + _NUKTA, "য়")
    out: list[str] = []
    chars = list(s)
    for i, ch in enumerate(chars):
        nxt = chars[i + 1] if i + 1 < len(chars) else ""
        if ch in _CONS:
            out.append(_CONS[ch])
            # Inherent vowel unless a sign, halant or the end of a word follows
            if ch not in "ংঃঁৎ" and nxt and nxt not in _SIGNS and nxt != _HALANT and nxt in _CONS:
                out.append("o")
        elif ch in _VOWELS:
            out.append(_VOWELS[ch])
        elif ch in _SIGNS:
            out.append(_SIGNS[ch])
        elif ch in (_HALANT, _NUKTA, "‌", "‍"):
            continue
        else:
            out.append(ch)
    return "".join(out)


# Generic words that don't identify a place: admin terms and place types, in both scripts
_GENERIC = {
    "district", "zila", "zilla", "division", "upazila", "thana", "sadar", "union", "hill", "hills", "tracts",
    "জেলা", "বিভাগ", "উপজেলা", "থানা", "সদর", "পার্বত্য",
    "mosque", "masjid", "jame", "jama", "shahi", "temple", "mandir", "church", "pagoda", "monastery", "bihar", "vihara",
    "dargah", "mazar", "shrine", "museum", "park", "eco", "lake", "dighi", "pond", "beach", "sea", "falls", "fall",
    "waterfall", "jharna", "national", "forest", "reserve", "reserved", "wildlife", "sanctuary", "safari", "island",
    "mountain", "taung", "daung", "tlang", "haphong", "the", "of", "and",
    "railway", "station", "junction", "rail", "bus", "terminal", "stand", "ghat", "launch", "airport", "international",
    "রেলওয়ে", "রেল", "স্টেশন", "জংশন", "বাস", "টার্মিনাল", "ঘাট", "লঞ্চ", "বিমানবন্দর",
    "মসজিদ", "জামে", "শাহী", "মন্দির", "গির্জা", "প্যাগোডা", "বিহার", "দরগাহ", "মাজার", "জাদুঘর", "পার্ক", "ইকো", "লেক",
    "হ্রদ", "দিঘি", "দিঘী", "সমুদ্র", "সৈকত", "সমুদ্রসৈকত", "ঝর্ণা", "ঝরনা", "জলপ্রপাত", "জাতীয়", "উদ্যান", "বন",
    "সংরক্ষিত", "বন্যপ্রাণী", "অভয়ারণ্য", "সাফারি", "দ্বীপ", "পাহাড়", "পর্বত",
}
_GENERIC = {unicodedata.normalize("NFC", w) for w in _GENERIC}

# Words that say what kind of place it is, by type
_TYPE_WORDS = {
    "mosque": ("mosque", "masjid", "jame", "jama", "মসজিদ", "জামে"),
    "temple": ("temple", "mandir", "pagoda", "monastery", "bihar", "vihara", "মন্দির", "প্যাগোডা", "বিহার"),
    "church": ("church", "গির্জা"),
    "shrine": ("dargah", "mazar", "shrine", "দরগাহ", "মাজার"),
    "museum": ("museum", "জাদুঘর"),
    "water": ("lake", "dighi", "pond", "লেক", "হ্রদ", "দিঘি", "দিঘী"),
    "beach": ("beach", "sea", "সমুদ্র", "সৈকত", "সমুদ্রসৈকত"),
    "falls": ("falls", "fall", "waterfall", "jharna", "ঝর্ণা", "ঝরনা", "জলপ্রপাত"),
    "park": ("park", "eco", "safari", "পার্ক", "ইকো", "সাফারি", "উদ্যান"),
    "forest": ("forest", "reserve", "reserved", "wildlife", "sanctuary", "বন", "সংরক্ষিত", "বন্যপ্রাণী", "অভয়ারণ্য"),
    "island": ("island", "দ্বীপ"),
    "hill": ("hill", "hills", "mountain", "taung", "daung", "tlang", "haphong", "পাহাড়", "পর্বত"),
}
_TYPE_OF = {unicodedata.normalize("NFC", w): t for t, words in _TYPE_WORDS.items() for w in words}


def place_types(name: str | None) -> set[str]:
    if not name:
        return set()
    words = re.split(r"[\s\-_/,.'’()]+", clean(name) or "")
    return {_TYPE_OF[w.casefold()] for w in words if w.casefold() in _TYPE_OF}
_FOLDS = [("ph", "f"), ("sh", "s"), ("kh", "k"), ("gh", "g"), ("bh", "b"), ("dh", "d"), ("th", "t"), ("jh", "j"),
          ("chh", "c"), ("ch", "c"), ("w", "o"), ("v", "b"), ("z", "j"), ("y", "i"), ("q", "k"),
          ("ee", "i"), ("oo", "u"), ("ou", "o"), ("au", "o")]


def match_key(name: str | None, *, drop_generic: bool = True) -> str:
    """A spelling-insensitive key: Latin, lower case, generic words dropped, variants folded,
    vowels collapsed so that o/a/u differences (Chittagong / Chattogram) weigh less."""
    if not name:
        return ""
    s = clean(name) or ""
    # "Buddha Dhatu Jadi (Golden Temple)", "Guthia Mosque, Wazirpur, Barishal": the name is before
    # the brackets and the first comma (official lists often add the location)
    core = re.sub(r"\(.*?\)", " ", s).split(",")[0].split("،")[0].strip(" ।")
    s = core or s
    words = [w for w in re.split(r"[\s\-_/,.'’()]+", s) if w]
    if drop_generic:
        kept = [w for w in words if w.casefold() not in _GENERIC]
        words = kept or words
    s = " ".join(words)
    if re.search(r"[ঀ-৿]", s):
        s = bn_to_latin(s)
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^a-z0-9 ]", "", s)
    for a, b in _FOLDS:
        s = s.replace(a, b)
    s = re.sub(r"h", "", s)                       # aspiration is spelled inconsistently
    s = re.sub(r"[aeiou]+", "a", s)              # vowel quality is spelled inconsistently
    s = re.sub(r"(.)\1+", r"\1", s)              # doubled letters
    return " ".join(s.split())


def name_similarity(a: str | None, b: str | None) -> float:
    """0-100: how alike two names are once spelling differences and generic words (mosque, beach,
    lake …) are folded away. Very short keys must match exactly: "Bagha" vs "Fauti" is not 60 % alike."""
    ka, kb = match_key(a), match_key(b)
    if not ka or not kb:
        return 0.0
    ta, tb = place_types(a), place_types(b)
    if ta and tb and not (ta & tb):  # "Bagha Museum" is not "Bagha Mosque"
        return 0.0
    if min(len(ka.replace(" ", "")), len(kb.replace(" ", ""))) < 5:
        return 100.0 if ka == kb else 0.0
    return float(fuzz.ratio(ka, kb))
