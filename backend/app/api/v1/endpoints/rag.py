"""
Vromon API v1 — RAG retrieval endpoints.

GET  /api/v1/rag/search           — Semantic search
POST /api/v1/rag/ingest           — Trigger ingestion (admin)
GET  /api/v1/rag/status           — Ingestion status
POST /api/v1/rag/ask              — Grounded question answering (LLM)
POST /api/v1/rag/trips/{trip_id}/items/{item_id}/explanation
                                  — Grounded explanation of a scheduled activity (LLM)
"""

from __future__ import annotations

import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.auth import get_current_user
from app.core.rate_limit import LLM_LIMIT, limiter
from app.db.base import get_db
from app.models.models import User
from app.services.llm.provider import (
    LLMError,
    LLMProvider,
    LLMProviderError,
    get_llm_provider,
)
from app.services.rag.generation import GroundedAnswer
from app.services.rag.retrieval import RetrievalError

logger = logging.getLogger("vromon.api.rag")
router = APIRouter(prefix="/rag", tags=["rag"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SearchResult(BaseModel):
    chunk_id: int
    source_id: int
    score: float
    text: str
    source_title: str
    source_type: str
    destination: str
    url: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResult]


class IngestResponse(BaseModel):
    status: str
    results: list[dict]


class RagStatusResponse(BaseModel):
    total_documents: int
    total_chunks: int
    embedded_chunks: int
    destinations: list[str]
    embedding_model: str
    llm_configured: bool
    llm_model: Optional[str] = None
    min_score: float


class AskRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=500)
    destination: Optional[str] = Field(None, description="Restrict evidence to one destination")
    top_k: Optional[int] = Field(None, ge=1, le=10)


# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------

def get_llm() -> LLMProvider | LLMError:
    """
    Resolve the configured LLM. Returns the error instead of raising so that
    request validation (422) is reported before LLM availability (503).
    """
    try:
        return get_llm_provider()
    except LLMError as exc:
        return exc


def _require_llm(llm: LLMProvider | LLMError) -> LLMProvider:
    if isinstance(llm, LLMError):
        raise HTTPException(status_code=503, detail=str(llm))
    return llm


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/search", response_model=SearchResponse, summary="Semantic search over travel content")
def rag_search(
    q: str = Query(..., min_length=2, description="Natural language search query"),
    destination: Optional[str] = Query(None, description="Filter by destination name"),
    source_type: Optional[str] = Query(
        None,
        description="Filter by source type: place, restaurant, hotel, destination"
    ),
    top_k: int = Query(5, ge=1, le=20, description="Number of results to return"),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),  # embedding calls are paid: signed-in users only
):
    """
    Perform semantic search over all ingested travel content.

    Returns the most relevant chunks for the given query, ranked by
    cosine similarity to the embedded query vector.
    """
    from app.services.rag.retrieval import retrieve

    results = retrieve(
        query=q,
        db=db,
        destination=destination,
        source_type=source_type,
        top_k=top_k,
    )

    return SearchResponse(
        query=q,
        total=len(results),
        results=[SearchResult(**r) for r in results],
    )


def require_admin(x_admin_token: Optional[str] = Header(None)) -> None:
    """
    Admin guard. With ADMIN_TOKEN set, the X-Admin-Token header must match it.
    Without ADMIN_TOKEN, admin endpoints are only open in development.
    """
    from app.core.config import settings

    if settings.admin_token:
        if not x_admin_token or not secrets.compare_digest(x_admin_token, settings.admin_token):
            raise HTTPException(status_code=401, detail="Missing or invalid X-Admin-Token.")
    elif not settings.is_development:
        raise HTTPException(status_code=403, detail="Admin endpoints are disabled: set ADMIN_TOKEN.")


@router.post("/ingest", response_model=IngestResponse, summary="Trigger RAG ingestion (admin)")
def rag_ingest(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    """
    Re-run the RAG ingestion pipeline over all seed data files.

    Idempotent: only re-embeds chunks whose content has changed.
    """
    from app.services.rag.ingestion import ingest_all_seed_files

    try:
        results = ingest_all_seed_files(db)
        return IngestResponse(status="ok", results=results)
    except Exception as exc:
        logger.error(f"Ingestion failed: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Ingestion error: {exc}")


@router.get("/status", response_model=RagStatusResponse, summary="RAG ingestion status")
def rag_status(db: Session = Depends(get_db)):
    """Return current ingestion statistics from the database."""
    from app.models.models import SourceDocument, DocumentChunk
    from app.services.rag.embeddings import get_embedding_provider

    total_docs = db.query(SourceDocument).count()
    total_chunks = db.query(DocumentChunk).count()
    embedded_chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.embedding_json.isnot(None))
        .count()
    )
    destinations = [
        row[0]
        for row in db.query(SourceDocument.destination_name).distinct().all()
        if row[0]
    ]
    from app.core.config import settings

    provider = get_embedding_provider()

    return RagStatusResponse(
        total_documents=total_docs,
        total_chunks=total_chunks,
        embedded_chunks=embedded_chunks,
        destinations=destinations,
        embedding_model=provider.model_name,
        llm_configured=settings.has_llm,
        llm_model=settings.llm_model if settings.has_llm else None,
        min_score=settings.rag_min_score,
    )


@router.post("/ask", response_model=GroundedAnswer, summary="Grounded question answering")
@limiter.limit(LLM_LIMIT)
def rag_ask(
    request: Request,  # required by the rate limiter
    payload: AskRequest,
    db: Session = Depends(get_db),
    llm: LLMProvider | LLMError = Depends(get_llm),
    _user: User = Depends(get_current_user),
):
    """
    Answer a travel question using only retrieved evidence.

    Returns status "insufficient_evidence" (HTTP 200) when the evidence does not
    support an answer. Every claim cites sources that map to real ingested chunks.
    """
    from app.services.rag.generation import answer_question

    llm = _require_llm(llm)
    try:
        return answer_question(
            question=payload.question,
            db=db,
            llm=llm,
            destination=payload.destination,
            top_k=payload.top_k,
        )
    except (LLMProviderError, RetrievalError) as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post(
    "/trips/{trip_id}/items/{item_id}/explanation",
    response_model=GroundedAnswer,
    summary="Grounded explanation of a scheduled activity",
)
@limiter.limit(LLM_LIMIT)
def explain_item(
    request: Request,  # required by the rate limiter
    trip_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    llm: LLMProvider | LLMError = Depends(get_llm),
    user: User = Depends(get_current_user),
):
    """
    Explain why an itinerary activity was chosen, using its source record and the
    deterministic ranking output. Does not modify the itinerary.
    """
    from app.models.models import Itinerary, ItineraryItem, Trip
    from app.services.rag.generation import explain_itinerary_item

    trip = db.get(Trip, trip_id)
    if trip is None or trip.user_id != user.id:
        raise HTTPException(status_code=404, detail=f"Trip {trip_id} not found")
    item = (
        db.query(ItineraryItem)
        .join(Itinerary)
        .filter(ItineraryItem.id == item_id, Itinerary.trip_id == trip_id)
        .first()
    )
    if item is None:
        raise HTTPException(status_code=404, detail=f"Item {item_id} not found in trip {trip_id}")

    llm = _require_llm(llm)  # after the ownership check: strangers get 404, not 503

    try:
        return explain_itinerary_item(trip, item, db, llm)
    except LLMProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
