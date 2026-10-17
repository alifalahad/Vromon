"""
Vromon Backend — photo processing (prompt §4.4, §8).

Every upload is decoded and re-encoded from its pixels alone, so nothing from the
original file survives: no EXIF (GPS included), XMP, IPTC, comments, or trailing
data. Orientation is applied to the pixels first and colours are converted to sRGB.
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass
from datetime import date, datetime

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_PIXELS = 50_000_000  # well above any phone camera; stops decompression bombs
FULL_EDGE = 2048
THUMB_EDGE = 480
FULL_QUALITY = 85
THUMB_QUALITY = 78

# EXIF tags
_EXIF_IFD = 0x8769
_DATETIME_ORIGINAL = 36867
_DATETIME = 306

_SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB"))


class PhotoRejected(ValueError):
    """The upload isn't a usable image. The message is safe to show."""


@dataclass(frozen=True)
class ProcessedPhoto:
    full: bytes
    thumb: bytes
    width: int
    height: int
    thumb_width: int
    thumb_height: int
    taken_on: date | None


def process_photo(data: bytes) -> ProcessedPhoto:
    """Decode, validate, orient, convert to sRGB, resize, and re-encode as clean JPEGs."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img = Image.open(io.BytesIO(data))
            if img.format not in ALLOWED_FORMATS:
                raise PhotoRejected("Only JPEG, PNG and WebP photos are supported")
            if img.width * img.height > MAX_PIXELS:
                raise PhotoRejected("That photo is too large")
            taken_on = _taken_on(img)
            img = ImageOps.exif_transpose(img)  # also loads the pixels
    except PhotoRejected:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, Image.DecompressionBombWarning, OSError, SyntaxError, ValueError):
        raise PhotoRejected("That file isn't a photo Vromon can read")

    rgb = _to_srgb(img)
    full = _fit(rgb, FULL_EDGE)
    thumb = _fit(rgb, THUMB_EDGE)
    return ProcessedPhoto(
        full=_clean_jpeg(full, FULL_QUALITY),
        thumb=_clean_jpeg(thumb, THUMB_QUALITY),
        width=full.width,
        height=full.height,
        thumb_width=thumb.width,
        thumb_height=thumb.height,
        taken_on=taken_on,
    )


def _taken_on(img: Image.Image) -> date | None:
    """The capture date from EXIF, read before the metadata is thrown away."""
    try:
        exif = img.getexif()
        raw = exif.get_ifd(_EXIF_IFD).get(_DATETIME_ORIGINAL) or exif.get(_DATETIME)
        if not isinstance(raw, str):
            return None
        day = datetime.strptime(raw.strip()[:10], "%Y:%m:%d").date()
    except Exception:  # missing or malformed EXIF is normal
        return None
    return day if date(1900, 1, 1) <= day <= date.today() else None


def _to_srgb(img: Image.Image) -> Image.Image:
    """An RGB image in sRGB. Transparency is flattened onto white."""
    icc = img.info.get("icc_profile")
    if icc and img.mode in ("RGB", "CMYK"):
        try:
            img = ImageCms.profileToProfile(img, ImageCms.ImageCmsProfile(io.BytesIO(icc)), _SRGB, outputMode="RGB")
        except (ImageCms.PyCMSError, OSError):
            pass  # a broken profile: keep the pixels as they are
    if img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info):
        rgba = img.convert("RGBA")
        flat = Image.new("RGB", rgba.size, (255, 255, 255))
        flat.paste(rgba, mask=rgba.getchannel("A"))
        return flat
    return img.convert("RGB")


def _fit(img: Image.Image, edge: int) -> Image.Image:
    if max(img.size) <= edge:
        return img
    scale = edge / max(img.size)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.Resampling.LANCZOS)


def _clean_jpeg(img: Image.Image, quality: int) -> bytes:
    # A brand-new image carries no `info` (EXIF, XMP, ICC, comments) from the original
    clean = Image.new("RGB", img.size)
    clean.paste(img)
    buf = io.BytesIO()
    clean.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
    return buf.getvalue()
