"""Where the data platform keeps its files."""

from __future__ import annotations

import os
from pathlib import Path

PLATFORM_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = PLATFORM_DIR.parent
REGISTRY_FILE = PLATFORM_DIR / "source-registry" / "sources.yaml"
ASSESSMENTS_DIR = PLATFORM_DIR / "source-registry" / "source-assessments"
# Raw snapshots are never edited and never committed (only their manifests are)
RAW_DIR = Path(os.environ.get("VROMON_RAW_DIR", PLATFORM_DIR / "raw"))
MANIFEST_DIR = PLATFORM_DIR / "manifests"
EXPORTS_DIR = PLATFORM_DIR / "exports"
REPORTS_DIR = PLATFORM_DIR / "quality-reports"
