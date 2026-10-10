"""
RAGService — Placeholder for future Retrieval-Augmented Generation.

Current implementation: returns structured mock context.

Future: Replace retrieve_context() and generate_grounded_explanation()
with real vector DB retrieval + LLM generation (e.g. LangChain + ChromaDB
+ OpenAI / local LLM).

NOTE: Do NOT claim this is a real RAG system. It is an architectural
placeholder to ensure the interface is ready for future integration.
"""

from __future__ import annotations
from typing import Optional


class RAGService:
    """
    RAG interface placeholder.

    Methods:
      retrieve_context(query)           → mock context dict
      generate_grounded_explanation()   → mock explanation string
    """

    def retrieve_context(self, query: str) -> dict:
        """
        Retrieve relevant context for a query.

        CURRENT: Returns structured mock context for Cox's Bazar.
        FUTURE: Will perform vector similarity search over a knowledge base
                of travel documents, reviews, and destination guides.
        """
        return {
            "source": "Cox's Bazar Destination Knowledge (Demo)",
            "context": (
                "Cox's Bazar is home to the world's longest natural sea beach at 120 km. "
                "Key attractions include Laboni Beach, Himchari National Park, Inani Beach, "
                "Marine Drive, and the Ramu Buddhist temples. Best visited October–March. "
                "Local cuisine features fresh seafood, hilsa fish, and Bengali specialities."
            ),
            "confidence": 0.0,
            "is_mock": True,
            "note": "This is demo context. Real RAG retrieval will be added in future iterations.",
        }

    def generate_grounded_explanation(
        self,
        query: str,
        context: Optional[dict] = None,
    ) -> str:
        """
        Generate a context-grounded explanation.

        CURRENT: Returns a template string.
        FUTURE: Will call an LLM with retrieved context to produce
                natural-language explanations.
        """
        if context is None:
            context = self.retrieve_context(query)
        return (
            f"[Demo] Based on available destination information: "
            f"{context.get('context', '')} "
            f"(Note: Full AI-powered explanations will be available once RAG is integrated.)"
        )

    def get_service_info(self) -> dict:
        return {
            "name": "RAGService",
            "status": "placeholder",
            "description": "Mock RAG interface — real implementation pending.",
            "future": "Will use ChromaDB/Pinecone + LLM for grounded recommendations.",
        }
