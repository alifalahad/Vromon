"""
Vromon RAG — Embedding provider interface.

Supports:
  - Google Gemini embeddings (via the official google-genai SDK)
  - A deterministic dummy provider (for tests without API keys)

Usage:
    provider = get_embedding_provider()
    vectors = provider.embed_batch(["text one", "text two"])
"""

from __future__ import annotations

import hashlib
import logging
import math
from typing import Protocol

logger = logging.getLogger("vromon.rag.embeddings")

# Embedding dimension for the dummy provider (matches the default EMBEDDING_DIMENSION)
_DUMMY_DIM = 768


class EmbeddingProvider(Protocol):
    """Interface that all embedding providers must satisfy."""

    @property
    def model_name(self) -> str: ...

    @property
    def dimension(self) -> int: ...

    def embed(self, text: str) -> list[float]:
        """Embed a single text string."""
        ...

    def embed_query(self, text: str) -> list[float]:
        """Embed a search query (may use a different task type than documents)."""
        ...

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed a list of texts. Default: call embed() per item."""
        ...


# ---------------------------------------------------------------------------
# Dummy provider (deterministic, no API key needed)
# ---------------------------------------------------------------------------

class DummyEmbeddingProvider:
    """
    Deterministic test provider.

    Produces a unit-length vector derived from the SHA-256 hash of the text,
    so identical texts always get the same vector and similarity still works
    for simple smoke tests.
    """

    @property
    def model_name(self) -> str:
        return "dummy-hash-768"

    @property
    def dimension(self) -> int:
        return _DUMMY_DIM

    def embed(self, text: str) -> list[float]:
        digest = hashlib.sha256(text.encode()).digest()
        # Expand 32-byte digest to _DUMMY_DIM floats by cycling
        raw = [((b ^ (i % 256)) - 128) / 128.0 for i, b in enumerate(
            bytes(digest[i % len(digest)] for i in range(_DUMMY_DIM))
        )]
        # Normalize to unit length
        norm = math.sqrt(sum(x * x for x in raw)) or 1.0
        return [x / norm for x in raw]

    def embed_query(self, text: str) -> list[float]:
        return self.embed(text)

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t) for t in texts]


# ---------------------------------------------------------------------------
# Google provider
# ---------------------------------------------------------------------------

class GoogleEmbeddingProvider:
    """
    Uses the official Google Gen AI SDK (google-genai) for embeddings.
    Requires EMBEDDING_API_KEY and EMBEDDING_MODEL in env config.

    Documents and queries are embedded with different task types
    (RETRIEVAL_DOCUMENT / RETRIEVAL_QUERY), as recommended for Gemini embeddings.
    """

    def __init__(self, api_key: str, model: str = "gemini-embedding-001", dimension: int = 768, client=None):
        if client is None:
            from google import genai  # type: ignore
            client = genai.Client(api_key=api_key)
        self._client = client
        self._model = model
        self._dim = dimension

    @property
    def model_name(self) -> str:
        return f"{self._model}-{self._dim}"

    @property
    def dimension(self) -> int:
        return self._dim

    def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        from google.genai import types  # type: ignore
        result = self._client.models.embed_content(
            model=self._model,
            contents=texts,
            config=types.EmbedContentConfig(task_type=task_type, output_dimensionality=self._dim),
        )
        return [list(e.values) for e in result.embeddings]

    def embed(self, text: str) -> list[float]:
        return self._embed([text], "RETRIEVAL_DOCUMENT")[0]

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], "RETRIEVAL_QUERY")[0]

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return self._embed(texts, "RETRIEVAL_DOCUMENT")


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_embedding_provider() -> EmbeddingProvider:
    """
    Returns the configured embedding provider.

    Checks app config:
    - If embedding_provider is "gemini"/"google" and embedding_api_key is set → GoogleEmbeddingProvider
    - Otherwise → DummyEmbeddingProvider (safe for development/tests)
    """
    try:
        from app.core.config import settings
        if settings.has_embeddings:
            logger.info(f"Using Google embedding provider: {settings.embedding_model}")
            return GoogleEmbeddingProvider(
                api_key=settings.embedding_api_key,
                model=settings.embedding_model,
                dimension=settings.embedding_dimension,
            )
    except Exception as exc:
        logger.warning(f"Could not initialize Google embeddings: {exc}")

    logger.info("Using dummy embedding provider (no API key configured)")
    return DummyEmbeddingProvider()
