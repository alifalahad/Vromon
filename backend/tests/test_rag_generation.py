"""
Phase 8 tests — grounded RAG generation.

Provider-independent: the LLM is a scripted fake injected through the
LLMProvider interface, and embeddings use the dummy provider. No API keys or
network access are needed. Live tests live in test_rag_live.py.
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.endpoints.rag import get_llm
from app.db.base import Base, get_db
from app.db.seeder import seed_database
from app.main import app
from app.models.models import DocumentChunk, SourceDocument, Trip, TripConstraint, TripPreference
from app.services.llm.provider import (
    GeminiLLMProvider,
    LLMNotConfiguredError,
    LLMProviderError,
    get_llm_provider,
)
from app.services.rag.generation import (
    CONTEXT_LABEL,
    LLMClaim,
    LLMGroundedOutput,
    SYSTEM_PROMPT,
    answer_question,
    explain_itinerary_item,
)
from tests.conftest import TEST_USER_ID

SEED_FILE = Path(__file__).parents[2] / "data" / "seed" / "coxsbazar.json"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------

class FakeLLM:
    """Scripted LLM: returns a fixed output (or raises) and records prompts."""

    model_name = "fake-llm"

    def __init__(self, output: LLMGroundedOutput | None = None, error: Exception | None = None):
        self.output = output
        self.error = error
        self.calls: list[dict] = []

    def generate_structured(self, system, prompt, schema):
        self.calls.append({"system": system, "prompt": prompt, "schema": schema})
        if self.error:
            raise self.error
        return self.output


def answered(*claims: tuple[str, list[str]]) -> LLMGroundedOutput:
    return LLMGroundedOutput(
        status="answered",
        claims=[LLMClaim(text=t, source_labels=labels) for t, labels in claims],
    )


def fake_retriever(results: list[dict]):
    def _retrieve(query, db, destination=None, top_k=5):
        return results[:top_k]
    return _retrieve


# ---------------------------------------------------------------------------
# Database fixtures (seeded + ingested with dummy embeddings)
# ---------------------------------------------------------------------------

_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


def _get_test_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    from app.services.rag.ingestion import ingest_file

    Base.metadata.create_all(bind=_engine)
    db = _Session()
    try:
        seed_database(db)
        ingest_file(SEED_FILE, db)
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture
def db():
    session = _Session()
    yield session
    session.close()


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _get_test_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_llm, None)


def _chunk_result(db, title: str, score: float) -> dict:
    """A retrieval-shaped result built from a real ingested chunk."""
    chunk = db.query(DocumentChunk).join(SourceDocument).filter(SourceDocument.title == title).first()
    assert chunk is not None, f"{title} not ingested"
    return {
        "chunk_id": chunk.id,
        "source_id": chunk.source_id,
        "score": score,
        "text": chunk.content,
        "source_title": chunk.source.title,
        "source_type": chunk.source.source_type,
        "destination": chunk.source.destination_name,
        "url": chunk.source.url,
        "metadata": {},
    }


def make_generated_trip(client, db, interests=("Beach", "Nature")) -> Trip:
    today = date.today()
    trip = Trip(
        user_id=TEST_USER_ID,
        destination="Cox's Bazar", start_date=today, end_date=today, num_travelers=2,
        total_budget=20000, title="RAG Test Trip", status="draft",
    )
    db.add(trip)
    db.flush()
    pref = TripPreference(trip_id=trip.id, travel_style="Balanced", activity_level="Medium")
    pref.interests = list(interests)
    db.add(pref)
    cons = TripConstraint(trip_id=trip.id, max_activities_per_day=4)
    cons.must_visit = []
    cons.excluded_places = []
    db.add(cons)
    db.commit()
    resp = client.post(f"/api/v1/trips/{trip.id}/generate")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    return db.get(Trip, trip.id)


def first_item(trip: Trip, with_place: bool = True):
    for day in trip.itinerary_days:
        for item in day.items:
            if (item.place is not None) == with_place:
                return item
    return None


# ---------------------------------------------------------------------------
# answer_question — retrieval gate and validation
# ---------------------------------------------------------------------------

class TestAnswerQuestion:

    def test_no_evidence_above_threshold_skips_llm(self, db):
        llm = FakeLLM(answered(("Anything.", ["S1"])))
        result = answer_question(
            "Is there a casino?", db, llm, min_score=0.9,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.2)]),
        )
        assert result.status == "insufficient_evidence"
        assert result.answer is None
        assert llm.calls == []
        assert any("relevance threshold" in w for w in result.warnings)

    def test_nothing_retrieved_is_insufficient(self, db):
        llm = FakeLLM(answered(("Anything.", ["S1"])))
        result = answer_question("q?", db, llm, min_score=0.0, retriever=fake_retriever([]))
        assert result.status == "insufficient_evidence"
        assert llm.calls == []

    def test_sources_map_to_real_ingested_records(self, db):
        llm = FakeLLM(answered(("Laboni Beach is open from 06:00 to 20:00.", ["S1"])))
        result = answer_question(
            "When is Laboni Beach open?", db, llm, min_score=0.5,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.8)]),
        )
        assert result.status == "answered"
        assert result.answer == "Laboni Beach is open from 06:00 to 20:00."
        assert len(result.sources) == 1
        src = result.sources[0]
        chunk = db.get(DocumentChunk, src.chunk_id)
        assert chunk is not None
        assert chunk.source_id == src.source_document_id
        assert chunk.source.title == src.title == "Laboni Beach"
        assert src.url is None  # seed data has no URLs; none may be invented

    def test_only_cited_sources_are_returned(self, db):
        llm = FakeLLM(answered(("Laboni Beach is a beach.", ["S1"])))
        result = answer_question(
            "q?", db, llm, min_score=0.0,
            retriever=fake_retriever([
                _chunk_result(db, "Laboni Beach", 0.9),
                _chunk_result(db, "Himchari National Park", 0.8),
            ]),
        )
        assert [s.label for s in result.sources] == ["S1"]

    def test_unknown_citation_is_dropped(self, db):
        llm = FakeLLM(answered(
            ("Laboni Beach is a beach.", ["S1"]),
            ("There is a casino nearby.", ["S9"]),
        ))
        result = answer_question(
            "q?", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        assert result.status == "answered"
        assert "casino" not in result.answer
        assert any("S9" in w for w in result.warnings)

    def test_all_claims_invalid_becomes_insufficient(self, db):
        llm = FakeLLM(answered(("Made up.", ["S7"]), ("Also made up.", [])))
        result = answer_question(
            "q?", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        assert result.status == "insufficient_evidence"
        assert result.answer is None

    def test_invented_price_is_dropped(self, db):
        llm = FakeLLM(answered(
            ("Laboni Beach has an entry fee of ৳500.", ["S1"]),
            ("Laboni Beach opens at 6:00.", ["S1"]),
        ))
        result = answer_question(
            "q?", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        assert result.status == "answered"
        assert "500" not in result.answer
        assert "6:00" in result.answer
        assert any("500" in w for w in result.warnings)

    def test_invented_opening_hour_is_dropped(self, db):
        llm = FakeLLM(answered(("Laboni Beach closes at 23:30.", ["S1"])))
        result = answer_question(
            "q?", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        assert result.status == "insufficient_evidence"

    def test_llm_reported_insufficient_evidence(self, db):
        llm = FakeLLM(LLMGroundedOutput(status="insufficient_evidence", claims=[]))
        result = answer_question(
            "Visa rules?", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        assert result.status == "insufficient_evidence"
        assert result.answer is None

    def test_prompt_contains_evidence_and_rules(self, db):
        llm = FakeLLM(answered(("Laboni Beach is a beach.", ["S1"])))
        answer_question(
            "Tell me about Laboni Beach", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        call = llm.calls[0]
        assert call["system"] == SYSTEM_PROMPT
        assert "[S1]" in call["prompt"]
        assert "Laboni Beach" in call["prompt"]
        assert "Tell me about Laboni Beach" in call["prompt"]
        assert call["schema"] is LLMGroundedOutput

    def test_dummy_embeddings_produce_warning(self, db):
        llm = FakeLLM(answered(("Laboni Beach is a beach.", ["S1"])))
        result = answer_question(
            "q?", db, llm, min_score=0.0,
            retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
        )
        assert result.embedding_model.startswith("dummy")
        assert any("dummy" in w for w in result.warnings)

    def test_real_retrieval_path_returns_stored_chunks(self, db):
        """End-to-end with the real retriever (dummy vectors) and a permissive threshold."""
        llm = FakeLLM(answered(("This is a travel destination.", ["S1"])))
        result = answer_question("Cox's Bazar overview", db, llm, min_score=-1.0, top_k=3)
        assert result.status == "answered"
        for src in result.sources:
            assert db.get(DocumentChunk, src.chunk_id) is not None

    def test_provider_error_propagates(self, db):
        llm = FakeLLM(error=LLMProviderError("boom"))
        with pytest.raises(LLMProviderError):
            answer_question(
                "q?", db, llm, min_score=0.0,
                retriever=fake_retriever([_chunk_result(db, "Laboni Beach", 0.9)]),
            )


# ---------------------------------------------------------------------------
# explain_itinerary_item
# ---------------------------------------------------------------------------

class TestExplainItem:

    def test_explanation_uses_place_source_and_context(self, client, db):
        trip = make_generated_trip(client, db)
        item = first_item(trip, with_place=True)
        assert item is not None
        from app.services.rag.generation import _fmt
        score = _fmt(item.recommendation_score)
        llm = FakeLLM(answered(
            (f"It was ranked with a match score of {score} for your interests.", [CONTEXT_LABEL]),
            (f"{item.place.name} is a {item.place.category.lower()} attraction.", ["S1"]),
        ))
        result = explain_itinerary_item(trip, item, db, llm)
        assert result.status == "answered", result.warnings
        assert len(result.claims) == 2
        assert [s.title for s in result.sources] == [item.place.name]
        assert CONTEXT_LABEL in llm.calls[0]["prompt"]

    def test_explanation_drops_invented_numbers(self, client, db):
        trip = make_generated_trip(client, db)
        item = first_item(trip, with_place=True)
        llm = FakeLLM(answered(("You will spend 987654 BDT here.", [CONTEXT_LABEL, "S1"])))
        result = explain_itinerary_item(trip, item, db, llm)
        assert result.status == "insufficient_evidence"

    def test_explanation_does_not_modify_itinerary(self, client, db):
        trip = make_generated_trip(client, db)
        item = first_item(trip, with_place=True)
        before = (item.start_time, item.end_time, item.place_id, item.cost)
        explain_itinerary_item(trip, item, db, FakeLLM(answered(("A place.", ["S1"]))))
        db.expire_all()
        refreshed = db.get(type(item), item.id)
        assert (refreshed.start_time, refreshed.end_time, refreshed.place_id, refreshed.cost) == before

    def test_item_without_source_is_insufficient(self, db):
        trip = SimpleNamespace(destination="Cox's Bazar")
        item = SimpleNamespace(place=None, restaurant=None, title="Break")
        llm = FakeLLM(answered(("x", ["S1"])))
        result = explain_itinerary_item(trip, item, db, llm)
        assert result.status == "insufficient_evidence"
        assert llm.calls == []


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

class TestGenerationEndpoints:

    def test_ask_without_llm_returns_503(self, client):
        resp = client.post("/api/v1/rag/ask", json={"question": "Where can I see sunrise?"})
        assert resp.status_code == 503
        assert "LLM_API_KEY" in resp.json()["detail"]

    def test_ask_validates_question(self, client):
        app.dependency_overrides[get_llm] = lambda: FakeLLM()
        resp = client.post("/api/v1/rag/ask", json={"question": "x"})
        assert resp.status_code == 422

    def test_invalid_input_is_422_even_without_llm(self, client):
        resp = client.post("/api/v1/rag/ask", json={"question": "x"})
        assert resp.status_code == 422

    def test_ask_with_llm_returns_structured_answer(self, client, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "rag_min_score", -1.0)
        app.dependency_overrides[get_llm] = lambda: FakeLLM(answered(("A grounded sentence.", ["S1"])))
        resp = client.post("/api/v1/rag/ask", json={"question": "Tell me about beaches", "top_k": 3})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["status"] == "answered"
        assert data["llm_model"] == "fake-llm"
        assert data["sources"][0]["label"] == "S1"
        assert {"chunk_id", "source_document_id", "title", "snippet", "url"} <= data["sources"][0].keys()

    def test_ask_provider_failure_returns_502(self, client, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "rag_min_score", -1.0)
        app.dependency_overrides[get_llm] = lambda: FakeLLM(error=LLMProviderError("LLM request failed: Timeout"))
        resp = client.post("/api/v1/rag/ask", json={"question": "Tell me about beaches"})
        assert resp.status_code == 502
        assert "Timeout" in resp.json()["detail"]

    def test_explanation_endpoint(self, client, db):
        trip = make_generated_trip(client, db)
        item = first_item(trip, with_place=True)
        app.dependency_overrides[get_llm] = lambda: FakeLLM(answered(("A place worth visiting.", ["S1"])))
        resp = client.post(f"/api/v1/rag/trips/{trip.id}/items/{item.id}/explanation")
        assert resp.status_code == 200, resp.text
        assert resp.json()["status"] == "answered"

    def test_explanation_unknown_item_404(self, client, db):
        trip = make_generated_trip(client, db)
        app.dependency_overrides[get_llm] = lambda: FakeLLM()
        assert client.post(f"/api/v1/rag/trips/{trip.id}/items/999999/explanation").status_code == 404
        assert client.post("/api/v1/rag/trips/999999/items/1/explanation").status_code == 404

    def test_status_reports_llm_configuration(self, client):
        data = client.get("/api/v1/rag/status").json()
        assert data["llm_configured"] is False
        assert "min_score" in data

    def test_itinerary_generation_independent_of_llm(self, client, db, monkeypatch):
        """Scheduling + validation must work even when the LLM is broken."""
        import app.services.llm.provider as provider_mod

        def broken():
            raise LLMProviderError("should never be called")
        monkeypatch.setattr(provider_mod, "get_llm_provider", broken)
        trip = make_generated_trip(client, db)
        assert trip.status == "generated"
        assert trip.itinerary_days


# ---------------------------------------------------------------------------
# Provider adapters (fake SDK clients — no network)
# ---------------------------------------------------------------------------

class _FakeModels:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.kwargs = response, error, None

    def generate_content(self, **kwargs):
        self.kwargs = kwargs
        if self.error:
            raise self.error
        return self.response

    def embed_content(self, **kwargs):
        self.kwargs = kwargs
        n = len(kwargs["contents"])
        return SimpleNamespace(embeddings=[SimpleNamespace(values=[0.1] * 4) for _ in range(n)])


def _gemini(models: _FakeModels) -> GeminiLLMProvider:
    return GeminiLLMProvider(api_key="unused", model="gemini-test", client=SimpleNamespace(models=models))


class TestGeminiProvider:

    def test_returns_parsed_output_and_sends_schema(self):
        parsed = answered(("x", ["S1"]))
        models = _FakeModels(SimpleNamespace(parsed=parsed, text=None))
        out = _gemini(models).generate_structured("sys", "prompt", LLMGroundedOutput)
        assert out == parsed
        cfg = models.kwargs["config"]
        assert models.kwargs["model"] == "gemini-test"
        assert cfg.response_schema is LLMGroundedOutput
        assert cfg.response_mime_type == "application/json"
        assert cfg.system_instruction == "sys"

    def test_falls_back_to_json_text(self):
        models = _FakeModels(SimpleNamespace(parsed=None, text='{"status": "insufficient_evidence", "claims": []}'))
        out = _gemini(models).generate_structured("s", "p", LLMGroundedOutput)
        assert out.status == "insufficient_evidence"

    def test_invalid_json_raises_provider_error(self):
        models = _FakeModels(SimpleNamespace(parsed=None, text='{"status": "maybe"}'))
        with pytest.raises(LLMProviderError):
            _gemini(models).generate_structured("s", "p", LLMGroundedOutput)

    def test_empty_response_raises_provider_error(self):
        models = _FakeModels(SimpleNamespace(parsed=None, text=""))
        with pytest.raises(LLMProviderError):
            _gemini(models).generate_structured("s", "p", LLMGroundedOutput)

    def test_sdk_exception_wrapped(self):
        models = _FakeModels(error=TimeoutError("slow"))
        with pytest.raises(LLMProviderError, match="TimeoutError"):
            _gemini(models).generate_structured("s", "p", LLMGroundedOutput)

    def test_factory_not_configured(self):
        with pytest.raises(LLMNotConfiguredError):
            get_llm_provider()

    def test_factory_accepts_gemini_provider_name(self, monkeypatch):
        from app.core.config import settings
        monkeypatch.setattr(settings, "llm_provider", "gemini")
        monkeypatch.setattr(settings, "llm_api_key", "fake-key-no-network")
        provider = get_llm_provider()
        assert provider.model_name == settings.llm_model


class TestGoogleEmbeddings:

    def test_task_types_and_dimension(self):
        from app.services.rag.embeddings import GoogleEmbeddingProvider
        models = _FakeModels()
        p = GoogleEmbeddingProvider(api_key="unused", model="gemini-embedding-001", dimension=768,
                                    client=SimpleNamespace(models=models))
        p.embed("doc")
        assert models.kwargs["config"].task_type == "RETRIEVAL_DOCUMENT"
        assert models.kwargs["config"].output_dimensionality == 768
        p.embed_query("query")
        assert models.kwargs["config"].task_type == "RETRIEVAL_QUERY"
        assert p.model_name == "gemini-embedding-001-768"

    def test_factory_accepts_gemini_provider_name(self, monkeypatch):
        from app.core.config import settings
        from app.services.rag.embeddings import GoogleEmbeddingProvider, get_embedding_provider
        monkeypatch.setattr(settings, "embedding_provider", "gemini")
        monkeypatch.setattr(settings, "embedding_api_key", "fake-key-no-network")
        assert isinstance(get_embedding_provider(), GoogleEmbeddingProvider)


class TestReembedOnModelChange:

    def test_changed_model_triggers_reembedding(self, monkeypatch):
        import app.services.rag.ingestion as ingestion
        from app.services.rag.embeddings import DummyEmbeddingProvider

        class OtherModel(DummyEmbeddingProvider):
            @property
            def model_name(self) -> str:
                return "other-model-768"

        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=engine)
        session = sessionmaker(bind=engine)()
        try:
            first = ingestion.ingest_file(SEED_FILE, session)
            assert ingestion.ingest_file(SEED_FILE, session)["new_chunks"] == 0

            monkeypatch.setattr(ingestion, "get_embedding_provider", lambda: OtherModel())
            again = ingestion.ingest_file(SEED_FILE, session)
            assert again["new_chunks"] == first["new_chunks"]
            models = {m for (m,) in session.query(DocumentChunk.embedding_model).distinct()}
            assert models == {"other-model-768"}
        finally:
            session.close()
            engine.dispose()


# ---------------------------------------------------------------------------
# Real google-genai SDK wiring, with HTTP mocked (no network)
# ---------------------------------------------------------------------------

class TestGeminiSdkWiring:
    """Exercises the real SDK request/response path so SDK misuse is caught offline."""

    @staticmethod
    def _client(handler):
        import httpx
        from google import genai
        from google.genai import types
        return genai.Client(
            api_key="fake-key",
            http_options=types.HttpOptions(httpx_client=httpx.Client(transport=httpx.MockTransport(handler))),
        )

    def test_generate_request_and_parsing(self):
        import json
        import httpx

        seen = []

        def handler(request):
            seen.append((str(request.url), json.loads(request.content)))
            out = {"status": "answered", "claims": [{"text": "Opens at 06:00.", "source_labels": ["S1"]}]}
            return httpx.Response(200, json={"candidates": [{
                "content": {"role": "model", "parts": [{"text": json.dumps(out)}]}, "finishReason": "STOP"}]})

        llm = GeminiLLMProvider(api_key="unused", model="gemini-test", client=self._client(handler))
        out = llm.generate_structured("SYSTEM", "PROMPT", LLMGroundedOutput)

        assert isinstance(out, LLMGroundedOutput)
        assert out.claims[0].source_labels == ["S1"]
        url, body = seen[0]
        assert url.endswith("/models/gemini-test:generateContent")
        assert body["systemInstruction"]["parts"][0]["text"] == "SYSTEM"
        assert body["contents"][0]["parts"][0]["text"] == "PROMPT"
        gen = body["generationConfig"]
        assert gen["responseMimeType"] == "application/json"
        assert set(gen["responseSchema"]["properties"]) == {"status", "claims"}

    def test_rate_limit_is_reported_clearly(self):
        import httpx

        def handler(request):
            return httpx.Response(429, json={"error": {"code": 429, "message": "quota", "status": "RESOURCE_EXHAUSTED"}})

        llm = GeminiLLMProvider(api_key="unused", model="gemini-test", client=self._client(handler))
        with pytest.raises(LLMProviderError, match="429 RESOURCE_EXHAUSTED"):
            llm.generate_structured("s", "p", LLMGroundedOutput)

    def test_embedding_request(self):
        import json
        import httpx
        from app.services.rag.embeddings import GoogleEmbeddingProvider

        seen = []

        def handler(request):
            body = json.loads(request.content)
            seen.append((str(request.url), body))
            return httpx.Response(200, json={"embeddings": [{"values": [0.5] * 768} for _ in body["requests"]]})

        emb = GoogleEmbeddingProvider(api_key="unused", client=self._client(handler))
        vec = emb.embed_query("sunrise beach")
        assert len(vec) == 768
        url, body = seen[0]
        assert url.endswith("/models/gemini-embedding-001:batchEmbedContents")
        assert body["requests"][0]["taskType"] == "RETRIEVAL_QUERY"
        assert body["requests"][0]["outputDimensionality"] == 768


class TestSelfCheckRegressions:

    def test_embedding_failure_is_502_not_insufficient_evidence(self, client, monkeypatch):
        import app.services.rag.retrieval as retrieval
        from app.services.rag.embeddings import DummyEmbeddingProvider

        class Broken(DummyEmbeddingProvider):
            def embed_query(self, text):
                raise RuntimeError("bad key")

        monkeypatch.setattr(retrieval, "get_embedding_provider", lambda: Broken())
        app.dependency_overrides[get_llm] = lambda: FakeLLM(answered(("x", ["S1"])))
        resp = client.post("/api/v1/rag/ask", json={"question": "Tell me about beaches"})
        assert resp.status_code == 502
        assert "Embedding request failed" in resp.json()["detail"]
        # Plain search keeps its lenient behaviour
        assert client.get("/api/v1/rag/search", params={"q": "beaches"}).json()["total"] == 0

    def test_context_numbers_have_no_exponents(self):
        from app.services.rag.generation import _fmt
        assert _fmt(1_500_000) == "1500000"
        assert _fmt(0.7234) == "0.72"
        assert _fmt(250.0) == "250"
