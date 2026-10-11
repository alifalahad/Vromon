"""
Phase 7 tests — RAG ingestion and retrieval.

All tests use the DummyEmbeddingProvider so no API keys are required.
"""

from __future__ import annotations

import json
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base, get_db
from app.main import app


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.rollback()
    session.close()


@pytest.fixture(scope="module")
def client(db_engine):
    Session = sessionmaker(bind=db_engine)

    def override_get_db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Chunker tests
# ---------------------------------------------------------------------------

class TestChunker:
    def test_chunk_seed_data_produces_chunks(self):
        from app.services.rag.chunker import chunk_seed_data
        data = {
            "destination": "Test City",
            "places": [
                {
                    "id": 1,
                    "name": "Test Beach",
                    "category": "Beach",
                    "description": "A beautiful test beach.",
                    "rating": 4.5,
                    "review_count": 100,
                    "average_visit_duration": 2.0,
                    "estimated_cost": 0,
                    "opening_time": "06:00",
                    "closing_time": "20:00",
                    "best_time": "Morning",
                    "crowd_level": "Low",
                    "activity_level": "Low",
                    "tags": ["Beach"],
                }
            ],
            "restaurants": [],
            "hotels": [],
        }
        chunks = chunk_seed_data(data)
        # Destination overview + 1 place
        assert len(chunks) == 2

    def test_chunk_has_content_hash(self):
        from app.services.rag.chunker import chunk_seed_data
        data = {
            "destination": "Test City",
            "places": [],
            "restaurants": [],
            "hotels": [],
        }
        chunks = chunk_seed_data(data)
        assert all(c.content_hash for c in chunks)

    def test_same_text_same_hash(self):
        from app.services.rag.chunker import RawChunk
        c1 = RawChunk(text="hello world", source_title="T", source_type="place", destination="D")
        c2 = RawChunk(text="hello world", source_title="T", source_type="place", destination="D")
        assert c1.content_hash == c2.content_hash

    def test_different_text_different_hash(self):
        from app.services.rag.chunker import RawChunk
        c1 = RawChunk(text="hello world", source_title="T", source_type="place", destination="D")
        c2 = RawChunk(text="goodbye world", source_title="T", source_type="place", destination="D")
        assert c1.content_hash != c2.content_hash

    def test_coxsbazar_seed_chunks(self):
        """Ensure real seed file produces a reasonable number of chunks."""
        import json
        from pathlib import Path
        from app.services.rag.chunker import chunk_seed_data
        seed_path = Path(__file__).parents[2] / "data" / "seed" / "coxsbazar.json"
        with open(seed_path) as f:
            data = json.load(f)
        chunks = chunk_seed_data(data)
        # 1 destination + 25 places + 10 restaurants + 8 hotels = 44
        assert len(chunks) == 44


# ---------------------------------------------------------------------------
# Embedding provider tests
# ---------------------------------------------------------------------------

class TestEmbeddingProvider:
    def test_dummy_provider_returns_correct_dimension(self):
        from app.services.rag.embeddings import DummyEmbeddingProvider
        p = DummyEmbeddingProvider()
        vec = p.embed("test text")
        assert len(vec) == 768

    def test_dummy_provider_unit_length(self):
        import math
        from app.services.rag.embeddings import DummyEmbeddingProvider
        p = DummyEmbeddingProvider()
        vec = p.embed("test text")
        norm = math.sqrt(sum(x * x for x in vec))
        assert abs(norm - 1.0) < 1e-5

    def test_dummy_same_text_same_vector(self):
        from app.services.rag.embeddings import DummyEmbeddingProvider
        p = DummyEmbeddingProvider()
        v1 = p.embed("identical text")
        v2 = p.embed("identical text")
        assert v1 == v2

    def test_dummy_different_text_different_vector(self):
        from app.services.rag.embeddings import DummyEmbeddingProvider
        p = DummyEmbeddingProvider()
        v1 = p.embed("beach holiday")
        v2 = p.embed("mountain hiking")
        assert v1 != v2

    def test_factory_returns_dummy_without_keys(self, monkeypatch):
        from app.services.rag import embeddings
        from app.services.rag.embeddings import DummyEmbeddingProvider
        monkeypatch.setattr("app.core.config.settings.embedding_provider", "")
        monkeypatch.setattr("app.core.config.settings.embedding_api_key", "")
        provider = embeddings.get_embedding_provider()
        assert isinstance(provider, DummyEmbeddingProvider)

    def test_batch_embed(self):
        from app.services.rag.embeddings import DummyEmbeddingProvider
        p = DummyEmbeddingProvider()
        texts = ["beach", "mountain", "forest"]
        vecs = p.embed_batch(texts)
        assert len(vecs) == 3
        assert all(len(v) == 768 for v in vecs)


# ---------------------------------------------------------------------------
# Vector store tests
# ---------------------------------------------------------------------------

class TestVectorStore:
    def test_cosine_similarity_identical(self):
        from app.services.rag.vector_store import cosine_similarity
        v = [1.0, 0.0, 0.0]
        assert abs(cosine_similarity(v, v) - 1.0) < 1e-6

    def test_cosine_similarity_orthogonal(self):
        from app.services.rag.vector_store import cosine_similarity
        v1 = [1.0, 0.0]
        v2 = [0.0, 1.0]
        assert abs(cosine_similarity(v1, v2)) < 1e-6

    def test_cosine_similarity_opposite(self):
        from app.services.rag.vector_store import cosine_similarity
        v1 = [1.0, 0.0]
        v2 = [-1.0, 0.0]
        assert abs(cosine_similarity(v1, v2) + 1.0) < 1e-6


# ---------------------------------------------------------------------------
# Ingestion tests
# ---------------------------------------------------------------------------

class TestIngestion:
    def test_ingest_seed_file(self, db_session):
        from pathlib import Path
        from app.services.rag.ingestion import ingest_file
        seed_path = Path(__file__).parents[2] / "data" / "seed" / "coxsbazar.json"
        result = ingest_file(seed_path, db_session)
        assert result["file"] == "coxsbazar.json"
        assert result["new_chunks"] == 44

    def test_reingest_skips_unchanged(self, db_session):
        """Second ingest of same file should skip all chunks."""
        from pathlib import Path
        from app.services.rag.ingestion import ingest_file
        seed_path = Path(__file__).parents[2] / "data" / "seed" / "coxsbazar.json"
        result = ingest_file(seed_path, db_session)
        assert result["skipped"] == 44
        assert result["new_chunks"] == 0

    def test_chunks_stored_in_db(self, db_session):
        from app.models.models import DocumentChunk
        count = db_session.query(DocumentChunk).count()
        assert count == 44

    def test_chunks_have_embeddings(self, db_session):
        from app.models.models import DocumentChunk
        embedded = (
            db_session.query(DocumentChunk)
            .filter(DocumentChunk.embedding_json.isnot(None))
            .count()
        )
        assert embedded == 44

    def test_chunk_metadata_has_source_type(self, db_session):
        from app.models.models import DocumentChunk
        chunk = db_session.query(DocumentChunk).first()
        meta = json.loads(chunk.metadata_json)
        assert "source_type" in meta


# ---------------------------------------------------------------------------
# Retrieval tests
# ---------------------------------------------------------------------------

class TestRetrieval:
    def test_retrieve_returns_results(self, db_session):
        from app.services.rag.retrieval import retrieve
        results = retrieve("beach holiday Cox's Bazar", db=db_session, top_k=3)
        assert len(results) <= 3
        assert all("text" in r for r in results)

    def test_retrieve_with_destination_filter(self, db_session):
        from app.services.rag.retrieval import retrieve
        results = retrieve("beach", db=db_session, destination="Cox's Bazar", top_k=5)
        assert all(r["destination"] == "Cox's Bazar" for r in results)

    def test_retrieve_with_type_filter(self, db_session):
        from app.services.rag.retrieval import retrieve
        results = retrieve("seafood", db=db_session, source_type="restaurant", top_k=5)
        assert all(r["source_type"] == "restaurant" for r in results)

    def test_scores_between_minus_one_and_one(self, db_session):
        from app.services.rag.retrieval import retrieve
        results = retrieve("adventure hiking", db=db_session, top_k=5)
        for r in results:
            assert -1.0 <= r["score"] <= 1.0

    def test_results_ordered_by_score_descending(self, db_session):
        from app.services.rag.retrieval import retrieve
        results = retrieve("beach", db=db_session, top_k=5)
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_insufficient_evidence_no_crash(self, db_session):
        """Querying with zero-match criteria should return empty list gracefully."""
        from app.services.rag.retrieval import retrieve
        results = retrieve(
            "xyzzy frobnicator nonexistent 12345",
            db=db_session,
            destination="Nonexistent Place",
            top_k=5,
        )
        assert isinstance(results, list)


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

class TestRagAPI:
    def test_rag_status_endpoint(self, client):
        resp = client.get("/api/v1/rag/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_chunks" in data
        assert "embedded_chunks" in data
        assert "embedding_model" in data

    def test_rag_search_endpoint(self, client):
        resp = client.get("/api/v1/rag/search?q=beach")
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert data["query"] == "beach"

    def test_rag_search_with_filters(self, client):
        resp = client.get("/api/v1/rag/search?q=food&source_type=restaurant&top_k=3")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] <= 3

    def test_rag_search_requires_query(self, client):
        resp = client.get("/api/v1/rag/search")
        assert resp.status_code == 422

    def test_rag_search_short_query_rejected(self, client):
        resp = client.get("/api/v1/rag/search?q=a")
        assert resp.status_code == 422

    def test_rag_ingest_endpoint(self, client):
        resp = client.post("/api/v1/rag/ingest")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
