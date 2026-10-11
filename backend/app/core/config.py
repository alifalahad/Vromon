"""
Vromon Backend — Core configuration module.

Loads settings from environment variables and .env file.
Validates all required configuration at startup.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


# Accepted spellings for the Google Gemini API provider.
GOOGLE_PROVIDER_NAMES = ("gemini", "google")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- Application ---
    app_env: str = "development"
    app_debug: bool = False

    # --- Database ---
    database_url: str = "sqlite:///./vromon.db"

    # --- LLM ---
    llm_provider: str = ""
    llm_api_key: str = ""
    llm_model: str = "gemini-3.6-flash"
    llm_temperature: float = 0.2
    llm_timeout_seconds: float = 30.0

    # --- Embeddings ---
    embedding_provider: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "gemini-embedding-001"
    embedding_dimension: int = 768

    # --- Grounded RAG generation ---
    # Minimum cosine similarity for a retrieved chunk to count as evidence.
    # Calibrate against evaluation/rag_generation_eval.py for the chosen embedding model.
    rag_min_score: float = 0.55
    rag_top_k: int = 5

    # --- CP-SAT itinerary optimizer ---
    # Deterministic work limit (CP-SAT units, roughly seconds on a fast core) → reproducible results.
    optimizer_deterministic_limit: float = 5.0
    # Wall-clock safety cap; if this stops the search the result may not be reproducible.
    optimizer_time_limit_seconds: float = 15.0
    optimizer_workers: int = 8

    # --- Admin ---
    # Required as X-Admin-Token for admin endpoints (e.g. RAG ingest) outside development.
    admin_token: str = ""

    # --- CORS ---
    cors_origins: str = "http://localhost:3000,http://localhost:8081,http://localhost:19006"

    # --- Maps ---
    maps_provider: str = ""

    # --- Server ---
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    @property
    def has_llm(self) -> bool:
        return bool(self.llm_api_key and self.llm_provider.lower() in GOOGLE_PROVIDER_NAMES)

    @property
    def has_embeddings(self) -> bool:
        return bool(self.embedding_api_key and self.embedding_provider.lower() in GOOGLE_PROVIDER_NAMES)

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v:
            raise ValueError("DATABASE_URL must be set")
        return v


settings = Settings()
