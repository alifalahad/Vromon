"""
Google Play graphics for Vromon (docs/play-store/listing.md):

- assets/icon-512.png       512 × 512 app icon, from mobile/assets/icon.png
- assets/feature-graphic.png 1024 × 500, the Trips card illustration with the
  app's orange overlay, the icon and the name (original artwork only)
- assets/screenshots/*.png   phone screenshots cropped to 1080 × 2160 (2:1, Play's limit)

    backend/venv/bin/python scripts/store/render_assets.py [screenshot.png ...]

Screenshots are optional arguments (full-screen PNGs from `adb exec-out screencap -p`).
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "play-store" / "assets"
ICON = ROOT / "mobile" / "assets" / "icon.png"
ILLUSTRATION = ROOT / "mobile" / "assets" / "trips" / "stats-card.jpg"
FONT = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
OVERLAY = (190, 82, 24, 199)  # the stats card's rgba(190, 82, 24, 0.78)


def icon() -> None:
    Image.open(ICON).convert("RGBA").resize((512, 512), Image.Resampling.LANCZOS).save(OUT / "icon-512.png")


def feature_graphic() -> None:
    w, h = 1024, 500
    art = Image.open(ILLUSTRATION).convert("RGBA")
    scale = max(w / art.width, h / art.height)
    art = art.resize((round(art.width * scale), round(art.height * scale)), Image.Resampling.LANCZOS)
    art = art.crop(((art.width - w) // 2, (art.height - h) // 2, (art.width + w) // 2, (art.height + h) // 2))
    art.alpha_composite(Image.new("RGBA", (w, h), OVERLAY))
    logo = Image.open(ICON).convert("RGBA").resize((168, 168), Image.Resampling.LANCZOS)
    mask = Image.new("L", logo.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, *logo.size], radius=38, fill=255)
    art.paste(logo, (72, (h - 168) // 2), mask)
    d = ImageDraw.Draw(art)
    d.text((280, 150), "Vromon", font=ImageFont.truetype(FONT, 96), fill="white")
    d.text((284, 268), "Plan trips. Map the world you've seen.", font=ImageFont.truetype(FONT, 34), fill=(255, 255, 255, 235))
    art.convert("RGB").save(OUT / "feature-graphic.png")


def screenshot(src: Path, index: int) -> None:
    """Keep the top 2160 px of a 1080 × 2400 capture (drops the gesture-bar strip)."""
    img = Image.open(src).convert("RGB")
    target_h = img.width * 2
    img.crop((0, 0, img.width, min(img.height, target_h))).save(OUT / "screenshots" / f"{index:02d}-{src.stem}.png")


def main() -> None:
    (OUT / "screenshots").mkdir(parents=True, exist_ok=True)
    icon()
    feature_graphic()
    for i, path in enumerate(sys.argv[1:], start=1):
        screenshot(Path(path), i)
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
