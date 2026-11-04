"""
Correctly shaped Bangla (and Latin) text for maps, drawn as vector outlines.

Matplotlib's own text engine doesn't apply OpenType shaping, so Bangla conjuncts and vowel
signs come out wrong, and Pillow's Windows wheels have no raqm. HarfBuzz (uharfbuzz)
shapes the string with the font's own rules; each shaped glyph's outline (fontTools) is
placed at HarfBuzz's position and drawn as a matplotlib path. Fonts: Noto Sans Bengali /
Noto Sans (SIL Open Font License, assets/fonts/OFL.txt).
"""

from __future__ import annotations

from functools import lru_cache

import uharfbuzz as hb
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont
from matplotlib.path import Path

from vromon_data.paths import PLATFORM_DIR

FONTS = PLATFORM_DIR / "assets" / "fonts"
FACES = {"bn": "NotoSansBengali-Regular.ttf", "bn-bold": "NotoSansBengali-Bold.ttf", "en": "NotoSans-Regular.ttf"}


class _PathPen(BasePen):
    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.verts: list[tuple[float, float]] = []
        self.codes: list[int] = []

    def _moveTo(self, p):
        self.verts.append(p)
        self.codes.append(Path.MOVETO)

    def _lineTo(self, p):
        self.verts.append(p)
        self.codes.append(Path.LINETO)

    def _curveToOne(self, p1, p2, p3):
        self.verts += [p1, p2, p3]
        self.codes += [Path.CURVE4] * 3

    def _qCurveToOne(self, p1, p2):
        self.verts += [p1, p2]
        self.codes += [Path.CURVE3] * 2

    def _closePath(self):
        self.verts.append((0, 0))
        self.codes.append(Path.CLOSEPOLY)


@lru_cache(maxsize=8)
def _font(face: str):
    path = FONTS / FACES[face]
    blob = hb.Blob.from_file_path(str(path))
    hb_font = hb.Font(hb.Face(blob))
    tt = TTFont(str(path))
    return hb_font, tt, tt.getGlyphSet(), tt.getGlyphOrder(), tt["head"].unitsPerEm


def _shape_run(text: str, face: str, x: float, verts: list, codes: list) -> float:
    hb_font, tt, glyphset, order, upem = _font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hb_font, buf, {"kern": True, "liga": True})
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        pen = _PathPen(glyphset)
        glyphset[order[info.codepoint]].draw(pen)
        dx, dy = x + pos.x_offset, pos.y_offset
        verts += [(vx + dx, vy + dy) for vx, vy in pen.verts]
        codes += pen.codes
        x += pos.x_advance
    return x


def _runs(text: str, face: str) -> list[tuple[str, str]]:
    """Split text into runs the face can draw and runs for the Latin fallback (·, —, Latin digits …)."""
    cmap = _font(face)[1].getBestCmap()
    fallback = "en" if face.startswith("bn") else face
    runs: list[tuple[str, str]] = []
    for ch in text:
        f = face if (ord(ch) in cmap or ch == " ") else fallback
        if runs and runs[-1][1] == f:
            runs[-1] = (runs[-1][0] + ch, f)
        else:
            runs.append((ch, f))
    return runs


def text_path(text: str, face: str = "bn") -> tuple[Path, float, float]:
    """(path in font units with the baseline at y=0, width, ascent) for `text`, shaped; characters the
    face lacks are drawn with the Latin face."""
    verts: list[tuple[float, float]] = []
    codes: list[int] = []
    x = 0.0
    for run, f in _runs(text, face):
        x = _shape_run(run, f, x, verts, codes)
    if not verts:
        return Path([(0, 0)], [Path.MOVETO]), 0.0, 0.0
    return Path(verts, codes), x, float(_font(face)[1]["hhea"].ascent)


def face_for(text: str, bold: bool = False) -> str:
    if any("ঀ" <= ch <= "৿" for ch in text):
        return "bn-bold" if bold else "bn"
    return "en"
