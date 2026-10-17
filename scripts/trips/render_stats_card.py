"""
Renders the Trips stats card background: an original illustration of an airliner
seen from below, drawn entirely by this script (prompt rule 10: no third-party
photo). The app lays a warm orange overlay on top, as in 10-trips-tab.jpg.

    backend/venv/bin/python scripts/trips/render_stats_card.py

Writes mobile/assets/trips/stats-card.jpg (deterministic: same output every run).
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "mobile" / "assets" / "trips" / "stats-card.jpg"

W, H = 1200, 720  # final size (5:3, the card's shape)
S = 3  # supersampling for smooth edges
ANGLE = -32  # the aircraft climbs towards the top left

SKY_TOP = (58, 52, 50)
SKY_BOTTOM = (150, 140, 130)
METAL = (214, 208, 200)
METAL_SHADE = (160, 152, 144)
LINE = (120, 112, 104)


def sky() -> Image.Image:
    img = Image.new("RGB", (W * S, H * S))
    px = ImageDraw.Draw(img)
    for y in range(H * S):
        for band in range(0, W * S, W * S // 8):
            t = min(1.0, max(0.0, (y / (H * S)) * 0.7 + (band / (W * S)) * 0.3))
            col = tuple(round(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_BOTTOM))
            px.line([(band, y), (band + W * S // 8, y)], fill=col)
    return img.filter(ImageFilter.GaussianBlur(40))


def aircraft() -> Image.Image:
    """The aircraft on a transparent layer, drawn level (nose right), then rotated."""
    lw, lh = int(W * S * 1.6), int(H * S * 1.6)
    layer = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = lw * 0.5, lh * 0.5
    L = lw * 0.62  # fuselage length
    R = lh * 0.075  # fuselage radius

    # Wings (swept back), drawn first so the fuselage sits on top
    root_front, root_back, tip_front, tip_back, span = cx + L * 0.06, cx - L * 0.16, cx - L * 0.20, cx - L * 0.30, lh * 0.46
    for side in (-1, 1):
        d.polygon([(root_front, cy), (tip_front, cy + side * span), (tip_back, cy + side * span), (root_back, cy)], fill=METAL_SHADE)
        # A lighter leading half and a flap line
        d.polygon([(root_front, cy), (tip_front, cy + side * span), (tip_front - L * 0.035, cy + side * span), (root_front - L * 0.06, cy)], fill=METAL)
        d.line([(root_back + L * 0.05, cy + side * R), (tip_back + L * 0.02, cy + side * span * 0.96)], fill=LINE, width=S * 2)

    # Engines under the wings
    for side in (-1, 1):
        ex, ey = cx - L * 0.02, cy + side * span * 0.42
        el, er = L * 0.15, R * 0.62
        d.rounded_rectangle([ex - el * 0.5, ey - er, ex + el * 0.5, ey + er], radius=er, fill=METAL)
        d.ellipse([ex + el * 0.38, ey - er * 0.95, ex + el * 0.56, ey + er * 0.95], fill=(70, 64, 60))  # intake
        d.ellipse([ex + el * 0.42, ey - er * 0.55, ex + el * 0.52, ey + er * 0.55], fill=(110, 104, 98))
        d.line([(ex - el * 0.3, ey - er * 0.98), (ex - el * 0.3, ey + er * 0.98)], fill=LINE, width=S * 2)

    # Tailplane
    tail_x = cx - L * 0.44
    for side in (-1, 1):
        d.polygon([(tail_x + L * 0.05, cy), (tail_x - L * 0.03, cy + side * lh * 0.16),
                   (tail_x - L * 0.075, cy + side * lh * 0.16), (tail_x - L * 0.04, cy)], fill=METAL_SHADE)

    # Fuselage: a capsule with a tapered tail cone
    nose, tail = cx + L * 0.5, cx - L * 0.5
    d.rounded_rectangle([tail + L * 0.1, cy - R, nose, cy + R], radius=R, fill=METAL)
    d.polygon([(tail + L * 0.1, cy - R), (tail, cy - R * 0.25), (tail, cy + R * 0.25), (tail + L * 0.1, cy + R)], fill=METAL)
    # Belly shading and panel seams
    d.rounded_rectangle([tail + L * 0.1, cy + R * 0.35, nose - R * 0.3, cy + R], radius=R * 0.6, fill=METAL_SHADE)
    for k in range(1, 12):
        x = tail + L * 0.1 + k * (L * 0.8 / 12)
        d.line([(x, cy - R * 0.92), (x, cy + R * 0.92)], fill=LINE, width=S)
    d.line([(tail + L * 0.12, cy), (nose - R * 0.8, cy)], fill=LINE, width=S)
    # Landing-gear doors (closed)
    for gx in (cx - L * 0.08, cx - L * 0.02):
        d.rounded_rectangle([gx, cy - R * 0.28, gx + L * 0.035, cy + R * 0.28], radius=S * 4, outline=LINE, width=S * 2)

    layer = layer.rotate(ANGLE, resample=Image.Resampling.BICUBIC, center=(cx, cy))
    # Centre the rotated layer on the card, shifted so the nose leaves the frame top-left
    ox, oy = int((W * S - lw) / 2 - W * S * 0.04), int((H * S - lh) / 2 - H * S * 0.02)
    canvas = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    canvas.alpha_composite(layer, (ox, oy)) if ox >= 0 and oy >= 0 else canvas.paste(layer, (ox, oy), layer)
    return canvas


def main() -> None:
    base = sky().convert("RGBA")
    plane = aircraft()
    shadow = Image.new("RGBA", plane.size, (0, 0, 0, 0))
    shadow.putalpha(plane.getchannel("A").point(lambda a: int(a * 0.35)))
    base.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(S * 18)), (S * 10, S * 14))
    base.alpha_composite(plane)
    img = base.convert("RGB").resize((W, H), Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
