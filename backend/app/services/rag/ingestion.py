"""
Vromon RAG — Ingestion pipeline.

Reads seed JSON files, produces RawChunks, embeds them, and persists
SourceDocument + DocumentChunk rows to the database.

Idempotent: chunks are re-ingested only if content_hash changed or they were
embedded with a different model than the currently configured provider.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from app.services.rag.chunker import chunk_seed_data, RawChunk
from app.services.rag.embeddings import get_embedding_provider
from app.services.rag.vector_store import store_embedding

logger = logging.getLogger("vromon.rag.ingestion")

# Path: backend/app/services/rag/ingestion.py  →  parents[4] = repo root
_SEED_DIR = Path(__file__).parents[4] / "data" / "seed"


def _is_embedded_with(source_id: int, model_name: str, db: "Session") -> bool:
    """True if every chunk of the source has a vector produced by model_name."""
    from app.models.models import DocumentChunk

    chunks = db.query(DocumentChunk).filter(DocumentChunk.source_id == source_id).all()
    return bool(chunks) and all(
        c.embedding_model == model_name and c.embedding_json is not None for c in chunks
    )


def ingest_file(path: Path, db: "Session") -> dict:
    """
    Ingest one seed JSON file into the vector store.

    Returns a summary dict: {"file": ..., "new_chunks": ..., "skipped": ...}
    """
    from app.models.models import SourceDocument, DocumentChunk

    logger.info(f"RAG ingestion: reading {path.name}")
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)

    chunks: list[RawChunk] = chunk_seed_data(data)
    provider = get_embedding_provider()

    new_count = 0
    skip_count = 0

    for idx, raw in enumerate(chunks):
        # Check if a SourceDocument for this title already exists
        existing_doc = (
            db.query(SourceDocument)
            .filter(SourceDocument.title == raw.source_title)
            .filter(SourceDocument.source_type == raw.source_type)
            .first()
        )

        if existing_doc is None:
            doc = SourceDocument(
                title=raw.source_title,
                source_type=raw.source_type,
                destination_name=raw.destination,
                content_hash=raw.content_hash,
                url=raw.url,
            )
            db.add(doc)
            db.flush()
            doc_id = doc.id
        else:
            # Skip if content unchanged and already embedded with the current model
            if existing_doc.content_hash == raw.content_hash and _is_embedded_with(
                existing_doc.id, provider.model_name, db
            ):
                skip_count += 1
                continue
            # Re-ingest: delete old chunks
            db.query(DocumentChunk).filter(
                DocumentChunk.source_id == existing_doc.id
            ).delete()
            existing_doc.content_hash = raw.content_hash
            db.flush()
            doc_id = existing_doc.id

        # Create the chunk row
        meta = {
            "source_type": raw.source_type,
            "place_name": raw.place_name,
            "category": raw.category,
            "tags": raw.tags,
            "destination": raw.destination,
        }
        chunk_row = DocumentChunk(
            source_id=doc_id,
            chunk_index=0,
            content=raw.text,
            metadata_json=json.dumps(meta, ensure_ascii=False),
            embedding_model=provider.model_name,
        )
        db.add(chunk_row)
        db.flush()

        # Embed and store the vector
        try:
            vector = provider.embed(raw.text)
            store_embedding(chunk_row.id, vector, db)
        except Exception as exc:
            logger.warning(f"Embedding failed for chunk {chunk_row.id}: {exc}")

        new_count += 1

    db.commit()
    logger.info(
        f"RAG ingestion complete for {path.name}: "
        f"new={new_count}, skipped={skip_count}"
    )
    return {"file": path.name, "new_chunks": new_count, "skipped": skip_count}


def ingest_all_seed_files(db: "Session") -> list[dict]:
    """Ingest every .json file in the data/seed directory."""
    results = []
    seed_dir = _SEED_DIR
    if not seed_dir.exists():
        logger.warning(f"Seed directory not found: {seed_dir}")
        return results

    for seed_file in sorted(seed_dir.glob("*.json")):
        try:
            result = ingest_file(seed_file, db)
            results.append(result)
        except Exception as exc:
            logger.error(f"Failed to ingest {seed_file.name}: {exc}", exc_info=True)
            results.append({"file": seed_file.name, "error": str(exc)})

    return results
