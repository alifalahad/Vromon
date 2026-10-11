"""
Vromon RAG — Semantic retrieval service.

High-level interface used by API endpoints and generation pipeline.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from app.services.rag.embeddings import get_embedding_provider
from app.services.rag.vector_store import semantic_search

logger = logging.getLogger("vromon.rag.retrieval")


class RetrievalError(Exception):
    """The query could not be embedded (provider failure, bad key, rate limit…)."""


def retrieve(
    query: str,
    db: "Session",
    destination: str | None = None,
    source_type: str | None = None,
    top_k: int = 5,
    raise_errors: bool = False,
) -> list[dict]:
    """
    Embed a natural language query and return the top_k matching chunks.

    Args:
        query:       Free-text question or keyword phrase
        db:          Active SQLAlchemy session
        destination: Filter to a specific destination (e.g. "Cox's Bazar")
        source_type: Filter by type ("place", "restaurant", "hotel", "destination")
        top_k:       Maximum results to return
        raise_errors: Raise RetrievalError on embedding failure instead of
                     returning [] (so callers can tell "no evidence" from "broken")

    Returns:
        List of result dicts, each with:
          chunk_id, score, text, source_title, source_type, destination, metadata
    """
    provider = get_embedding_provider()

    try:
        query_vec = provider.embed_query(query)
    except Exception as exc:
        logger.error(f"Embedding query failed: {exc}")
        if raise_errors:
            from app.services.llm.provider import describe_provider_error
            raise RetrievalError(f"Embedding request failed: {describe_provider_error(exc)}") from exc
        return []

    results = semantic_search(
        query_vector=query_vec,
        db=db,
        destination=destination,
        source_type=source_type,
        top_k=top_k,
        embedding_model=provider.model_name,
    )

    logger.info(
        f"Retrieval: query='{query[:60]}' → {len(results)} results "
        f"(destination={destination}, source_type={source_type})"
    )
    return results


def retrieve_for_place(place_name: str, db: "Session", top_k: int = 3) -> list[dict]:
    """Retrieve chunks most relevant to a specific named place."""
    return retrieve(
        query=f"Information about {place_name}",
        db=db,
        top_k=top_k,
    )


def retrieve_for_query(
    query: str,
    db: "Session",
    destination: str | None = None,
    top_k: int = 5,
) -> list[dict]:
    """General retrieval with optional destination filter."""
    return retrieve(query=query, db=db, destination=destination, top_k=top_k)
