"""
Phase 8 — optional LIVE integration tests against the real Gemini API.

Skipped unless VROMON_LIVE_TESTS=1 and LLM/embedding keys are set in backend/.env.
These make real (billable) API calls:

    cd backend
    VROMON_LIVE_TESTS=1 venv/bin/python -m pytest tests/test_rag_live.py -v
"""

from __future__ import annotations

import os

import pytest

from app.core.config import settings

pytestmark = pytest.mark.skipif(
    os.environ.get("VROMON_LIVE_TESTS") != "1" or not settings.has_llm,
    reason="Live tests disabled (set VROMON_LIVE_TESTS=1 and configure LLM_API_KEY)",
)

LABONI = {
    "chunk_id": 1, "source_id": 1, "score": 0.9,
    "text": (
        "Laboni Beach is a Beach in Cox's Bazar. The main city beach of Cox's Bazar, known for its "
        "vibrant atmosphere. Opening hours: 06:00 – 20:00. Estimated cost: ৳0."
    ),
    "source_title": "Laboni Beach", "source_type": "place", "destination": "Cox's Bazar",
    "url": None, "metadata": {},
}


def _retriever(query, db, destination=None, top_k=5):
    return [LABONI]


def test_live_strong_evidence_is_answered_with_citation():
    from app.services.llm.provider import get_llm_provider
    from app.services.rag.generation import answer_question

    result = answer_question("When does Laboni Beach open?", db=None, llm=get_llm_provider(),
                             min_score=0.0, retriever=_retriever)
    assert result.status == "answered", result.warnings
    assert all(c.source_labels for c in result.claims)
    assert [s.chunk_id for s in result.sources] == [1]


def test_live_unrelated_question_is_insufficient():
    from app.services.llm.provider import get_llm_provider
    from app.services.rag.generation import answer_question

    result = answer_question("What is the visa fee for entering Bangladesh?", db=None,
                             llm=get_llm_provider(), min_score=0.0, retriever=_retriever)
    assert result.status == "insufficient_evidence", result.answer


@pytest.mark.skipif(not settings.has_embeddings, reason="EMBEDDING_API_KEY not configured")
def test_live_embedding_dimension():
    from app.services.rag.embeddings import get_embedding_provider

    provider = get_embedding_provider()
    assert len(provider.embed_query("sunrise beach")) == settings.embedding_dimension
