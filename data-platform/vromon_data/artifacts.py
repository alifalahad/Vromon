"""
Raw snapshots: the exact bytes a source returned, stored once by checksum under
data-platform/raw/<source>/<date>/ and never edited. Git keeps only the manifests
(data-platform/manifests/<source>.jsonl: URL, sha256, size, time, licence).
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.catalog import SourceArtifact
from vromon_data import paths


def _safe_name(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name)[-80:] or "file"


def raw_path(artifact: SourceArtifact) -> Path:
    return paths.RAW_DIR / artifact.storage_path


def find_by_uri(session: Session, source_id: str, uri: str) -> SourceArtifact | None:
    """The latest artifact fetched from `uri` whose file is still on disk."""
    rows = session.scalars(select(SourceArtifact).where(SourceArtifact.source_id == source_id, SourceArtifact.uri == uri)
                           .order_by(SourceArtifact.fetched_at.desc())).all()
    return next((a for a in rows if raw_path(a).exists()), None)


def store(session: Session, *, source_id: str, uri: str, content: bytes, content_type: str | None,
          license_snapshot: str | None, job_id=None, filename_hint: str | None = None) -> tuple[SourceArtifact, bool]:
    """Save bytes as an immutable artifact. Returns (artifact, is_new). The same bytes from the same
    source are stored once."""
    sha = hashlib.sha256(content).hexdigest()
    existing = session.scalars(select(SourceArtifact).where(SourceArtifact.source_id == source_id,
                                                            SourceArtifact.sha256 == sha)).first()
    if existing is not None and raw_path(existing).exists():
        return existing, False
    now = datetime.utcnow()
    rel = Path(source_id) / now.strftime("%Y-%m-%d") / f"{sha[:12]}-{_safe_name(filename_hint or uri.rsplit('/', 1)[-1])}"
    full = paths.RAW_DIR / rel
    full.parent.mkdir(parents=True, exist_ok=True)
    if not full.exists():
        tmp = full.with_suffix(full.suffix + ".part")
        tmp.write_bytes(content)
        tmp.replace(full)
        full.chmod(0o444)  # read-only: raw snapshots are never edited
    if existing is not None:  # row exists but the file was lost: point it at the new copy
        existing.storage_path = rel.as_posix()
        return existing, False
    art = SourceArtifact(source_id=source_id, uri=uri, sha256=sha, bytes=len(content), content_type=content_type,
                         storage_path=rel.as_posix(), fetched_at=now, license_snapshot=license_snapshot,
                         first_job_id=job_id)
    session.add(art)
    session.flush()
    return art, True


def add_manual(session: Session, *, source_id: str, file: Path, license_snapshot: str | None, job_id=None) -> tuple[SourceArtifact, bool]:
    """A file a person downloaded in a browser (e.g. HDX behind its bot challenge)."""
    return store(session, source_id=source_id, uri=f"manual://{file.name}", content=file.read_bytes(),
                 content_type=None, license_snapshot=license_snapshot, job_id=job_id, filename_hint=file.name)


def write_manifest(artifact: SourceArtifact) -> None:
    paths.MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    line = {"uri": artifact.uri, "sha256": artifact.sha256, "bytes": artifact.bytes,
            "content_type": artifact.content_type, "fetched_at": artifact.fetched_at.isoformat(timespec="seconds"),
            "storage_path": artifact.storage_path, "license": artifact.license_snapshot}
    target = paths.MANIFEST_DIR / f"{artifact.source_id}.jsonl"
    known = target.read_text(encoding="utf-8") if target.exists() else ""
    if artifact.sha256 not in known:
        with open(target, "a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")


def copy_out(artifact: SourceArtifact, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(raw_path(artifact), dest)
    return dest
