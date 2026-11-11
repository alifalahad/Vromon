"""Each test gets its own SQLite database at the app's latest migration, and its own raw/manifest folders."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from vromon_data import db, paths


@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setattr(paths, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(paths, "MANIFEST_DIR", tmp_path / "manifests")
    monkeypatch.setattr(paths, "REPORTS_DIR", tmp_path / "reports")
    engine = db.make_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    db.migrate(engine)
    s = db.session_factory(engine)()
    yield s
    s.close()
    engine.dispose()


def square(x0: float, y0: float, x1: float, y1: float) -> dict:
    return {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}


def feature(sid: str, name: str, geom: dict, iso: str = "", level: str = "ADM1") -> dict:
    return {"type": "Feature", "geometry": geom,
            "properties": {"shapeName": name, "shapeISO": iso, "shapeID": sid, "shapeGroup": "BGD", "shapeType": level}}


# Two divisions side by side; three districts; four sub-districts (two named Kotwali)
ADM1 = [feature("D1", "Barisal", square(90.0, 22.0, 90.5, 22.5), "BD-A"),
        feature("D2", "Chittagong", square(90.5, 22.0, 91.0, 22.5), "BD-B")]
ADM2 = [feature("Z1", "Barisal", square(90.0, 22.0, 90.25, 22.5), level="ADM2"),
        feature("Z2", "Bhola", square(90.25, 22.0, 90.5, 22.5), level="ADM2"),
        feature("Z3", "Chittagong", square(90.5, 22.0, 91.0, 22.5), level="ADM2")]
ADM3 = [feature("U1", "Kotwali", square(90.0, 22.0, 90.25, 22.25), level="ADM3"),
        feature("U2", "Bakerganj", square(90.0, 22.25, 90.25, 22.5), level="ADM3"),
        feature("U3", "Bhola Sadar", square(90.25, 22.0, 90.5, 22.5), level="ADM3"),
        feature("U4", "Kotwali", square(90.5, 22.0, 91.0, 22.5), level="ADM3")]


def write_layers(folder: Path, adm3: list | None = None) -> dict[str, str]:
    folder.mkdir(parents=True, exist_ok=True)
    out = {}
    for level, feats in (("ADM1", ADM1), ("ADM2", ADM2), ("ADM3", adm3 if adm3 is not None else ADM3)):
        p = folder / f"geoBoundaries-BGD-{level}.geojson"
        p.write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")
        out[level] = str(p)
    return out


@pytest.fixture
def layers(tmp_path):
    return write_layers(tmp_path / "src")
