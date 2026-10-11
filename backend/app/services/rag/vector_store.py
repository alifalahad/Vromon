"""
Vromon RAG — SQLite-compatible vector store.

Uses numpy cosine similarity for retrieval since pgvector requires PostgreSQL.
Vectors are stored as JSON text in the DocumentChunk table.
When PostgreSQL + pgvector is added, this module can be swapped out with no
changes to the retrieval interface.
"""

from __future__ import annotations

import json
import logging
import math
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger("vromon.rag.vector_store")


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors."""
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def store_embedding(chunk_id: int, embedding: list[float], db: "Session") -> None:
    """Persist an embedding vector as JSON text on an existing DocumentChunk row."""
    from app.models.models import DocumentChunk
    chunk = db.get(DocumentChunk, chunk_id)
    if chunk is None:
        logger.warning(f"store_embedding: chunk {chunk_id} not found")
        return
    chunk.embedding_json = json.dumps(embedding)
    db.flush()


def semantic_search(
    query_vector: list[float],
    db: "Session",
    destination: str | None = None,
    source_type: str | None = None,
    top_k: int = 5,
    embedding_model: str | None = None,
) -> list[dict]:
    """
    Find the top_k most similar chunks to query_vector.

    Filters:
      - destination: only match chunks from a specific destination
      - source_type: "place" | "restaurant" | "hotel" | "destination"
      - embedding_model: only compare against vectors from the same model

    Returns a list of dicts with keys:
      chunk_id, score, text, source_title, source_type, destination, metadata
    """
    from app.models.models import DocumentChunk, SourceDocument

    query = db.query(DocumentChunk).join(SourceDocument)

    if destination:
        query = query.filter(SourceDocument.destination_name == destination)

    # Filter by source_type stored in metadata_json
    if source_type:
        # metadata_json stores {"source_type": "...", ...}
        # Use LIKE since SQLite has no JSON functions in older versions
        query = query.filter(
            DocumentChunk.metadata_json.like(f'%"source_type": "{source_type}"%')
        )

    # Only chunks that have been embedded (by the same model as the query vector)
    query = query.filter(DocumentChunk.embedding_json.isnot(None))
    if embedding_model:
        query = query.filter(DocumentChunk.embedding_model == embedding_model)

    chunks = query.all()

    if not chunks:
        return []

    results = []
    for chunk in chunks:
        try:
            vec = json.loads(chunk.embedding_json)  # type: ignore[arg-type]
        except Exception:
            continue
        score = cosine_similarity(query_vector, vec)
        meta = {}
        try:
            meta = json.loads(chunk.metadata_json or "{}")
        except Exception:
            pass
        results.append({
            "chunk_id": chunk.id,
            "source_id": chunk.source_id,
            "score": score,
            "text": chunk.content,
            "source_title": chunk.source.title,
            "source_type": meta.get("source_type", "unknown"),
            "destination": chunk.source.destination_name or "",
            "url": chunk.source.url,
            "metadata": meta,
        })

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:top_k]
