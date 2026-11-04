"""
Text from Bangla PDFs whose embedded fonts lack a complete Unicode map.

Government PDFs (Bangladesh Railway timetables and fare charts) are made with Bangla
fonts whose conjunct and vowel-sign glyphs have no ToUnicode entry, so ordinary
extraction gives "(cid:1166)লনা" for খুলনা. The font itself still says how each such
glyph is formed: its GSUB table substitutes character sequences with these glyphs. Running
those rules backwards (ligature → its components, single substitution → its input), from
the glyphs the cmap does map, recovers the characters of each glyph. Then the vowel signs
drawn before a consonant (ি ে ৈ) are moved back after it, as Unicode stores them.

Anything still unknown stays as "(cid:N)", never guessed; callers send such rows to review.
"""

from __future__ import annotations

import io
import re
from functools import lru_cache

import pdfplumber
from fontTools.ttLib import TTFont
from pdfminer.pdftypes import resolve1

_CID = re.compile(r"\(cid:(\d+)\)")
_PRE = "িেৈ"
_CONS = "ক-হৎড়ঢ়য়"  # consonants, incl. precomposed ড় ঢ় য় and ৎ
_CLUSTER = rf"(?:[{_CONS}]়?(?:্[{_CONS}]়?)*)"
_REORDER = re.compile(rf"([{_PRE}])({_CLUSTER})([াৗ])?")
REPH = ""


# REPH (above) is a placeholder: reph is drawn after its syllable but stored before it


def _glyph_text(tt: TTFont) -> dict[str, str]:
    """glyph name → the characters it stands for.

    Bangla fonts define below/post-base forms (ra-phala `blwf`, ya-phala `pstf`) and reph (`rphf`)
    from [consonant, halant], the order the shaping engine uses internally; in Unicode a phala is
    halant + consonant and reph is র্ before its syllable, so those features are mapped explicitly."""
    out: dict[str, str] = {}
    cmap = tt.getBestCmap() or {}
    for cp, glyph in cmap.items():
        out.setdefault(glyph, chr(cp))
    if "GSUB" not in tt:
        return out
    gsub = tt["GSUB"].table
    features: dict[int, set[str]] = {}
    for fr in gsub.FeatureList.FeatureRecord:
        for li in fr.Feature.LookupListIndex:
            features.setdefault(li, set()).add(fr.FeatureTag)
    changed = True
    while changed:
        changed = False
        for li, lookup in enumerate(gsub.LookupList.Lookup):
            tags = features.get(li, set())
            for sub in lookup.SubTable:
                kind = sub.LookupType if hasattr(sub, "LookupType") else lookup.LookupType
                if lookup.LookupType == 7:
                    sub = sub.ExtSubTable
                    kind = sub.LookupType
                if kind == 4:
                    for first, ligs in sub.ligatures.items():
                        for lig in ligs:
                            parts = [first, *lig.Component]
                            if lig.LigGlyph in out or not all(p in out for p in parts):
                                continue
                            text = "".join(out[p] for p in parts)
                            if tags & {"blwf", "pstf"} and len(text) == 2 and text[1] == "্":
                                text = "্" + text[0]          # phala: halant + consonant
                            elif "rphf" in tags and text == "র্":
                                text = REPH
                            out[lig.LigGlyph] = text
                            changed = True
                elif kind == 1:
                    for src, dst in sub.mapping.items():
                        if dst not in out and src in out:
                            out[dst] = out[src]
                            changed = True
    return out


@lru_cache(maxsize=32)
def _font_map(data: bytes) -> dict[int, str]:
    """CID (= glyph id for Identity CIDToGIDMap fonts) → characters."""
    tt = TTFont(io.BytesIO(data))
    names = _glyph_text(tt)
    return {gid: names[g] for gid, g in enumerate(tt.getGlyphOrder()) if g in names}


def _page_fonts(page) -> dict[str, dict[int, str]]:
    """pdfplumber font name → CID map, for fonts that embed a TrueType file."""
    out: dict[str, dict[int, str]] = {}
    fonts = resolve1(resolve1(page.page_obj.resources).get("Font", {})) or {}
    for ref in fonts.values():
        f = resolve1(ref)
        base = f.get("BaseFont")
        base = getattr(base, "name", str(base)).strip("/'")
        desc = resolve1(f.get("FontDescriptor")) if f.get("FontDescriptor") else None
        if desc is None and f.get("DescendantFonts"):
            desc = resolve1(resolve1(resolve1(f["DescendantFonts"])[0]).get("FontDescriptor"))
        ff = desc and desc.get("FontFile2")
        if ff:
            try:
                out[base] = _font_map(resolve1(ff).get_data())
            except Exception:  # an unreadable font: its glyphs stay "(cid:N)"
                continue
    return out


_REPH_AFTER = re.compile(rf"({_CLUSTER}[া-ৌৗঁ-ঃ]*){REPH}")


def reorder(text: str) -> str:
    """Visual order back to Unicode order: pre-base vowel signs after their consonant cluster
    (ে+সা → সো, ি+চ → চি), and reph before its syllable (কম + reph → র্কম … as in "কর্ম")."""
    def fix(m: re.Match) -> str:
        sign, cluster, tail = m.group(1), m.group(2), m.group(3) or ""
        if sign == "ে" and tail == "া":
            return cluster + "ো"
        if sign == "ে" and tail == "ৗ":
            return cluster + "ৌ"
        return cluster + sign + tail
    text = _REORDER.sub(fix, text)
    text = _REPH_AFTER.sub(lambda m: "র্" + m.group(1), text)
    text = re.sub(r" ([া-ৌৗ])", r"", text)  # a vowel sign never starts a word
    return text.replace(REPH, "র্")


def page_lines(page) -> list[str]:
    """The page's text lines with CIDs decoded and vowel signs reordered."""
    fonts = _page_fonts(page)
    chars = []
    for ch in page.chars:
        text = ch["text"]
        m = _CID.fullmatch(text)
        if m:
            fmap = fonts.get(ch["fontname"].split("+")[-1]) or fonts.get(ch["fontname"]) or \
                next((v for k, v in fonts.items() if ch["fontname"].endswith(k.split("+")[-1])), {})
            text = fmap.get(int(m.group(1)), text)
        if len(text) == 1 and ord(text) < 32:
            text = "�"  # an unmapped glyph: shown as unknown, never guessed
        chars.append({**ch, "text": text})
    lines: dict[int, list] = {}
    for ch in chars:
        lines.setdefault(round(ch["top"] / 3), []).append(ch)
    out = []
    for key in sorted(lines):
        row = sorted(lines[key], key=lambda c: c["x0"])
        s, prev = "", None
        for c in row:
            if prev is not None and c["x0"] - prev["x1"] > 1.5:
                s += " "
            s += c["text"]
            prev = c
        out.append(reorder(" ".join(s.split())))
    return out


def pdf_lines(path) -> list[list[str]]:
    with pdfplumber.open(path) as pdf:
        return [page_lines(p) for p in pdf.pages]
