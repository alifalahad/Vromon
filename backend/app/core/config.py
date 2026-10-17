"""
Vromon Backend — Core configuration module.

Loads settings from environment variables and .env file.
Validates all required configuration at startup.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import field_validator, model_validator
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

    # --- Auth (Supabase, decision D1) ---
    # Project URL, e.g. https://abcd1234.supabase.co. Access tokens are verified locally
    # against {supabase_url}/auth/v1/.well-known/jwks.json (asymmetric signing keys).
    supabase_url: str = ""
    supabase_jwt_audience: str = "authenticated"
    # Server-side only: used to delete the Supabase auth user on account deletion.
    supabase_service_role_key: str = ""
    # Development only: requests without a token act as a local "dev" user, so the app
    # keeps working before sign-in is wired up. Refused outside APP_ENV=development.
    dev_auth_bypass: bool = False

    # --- Admin ---
    # Required as X-Admin-Token for admin endpoints (e.g. RAG ingest) outside development.
    admin_token: str = ""

    # --- Push notifications (Expo Push API) ---
    push_enabled: bool = True
    # Optional: only needed if "enhanced push security" is turned on for the Expo project.
    expo_access_token: str = ""

    # --- Photos (prompt §8: private bucket, short-lived signed URLs) ---
    # "supabase": the private Supabase Storage bucket (needs SUPABASE_URL and the service role key).
    # "local": files under photo_local_dir with URLs signed by this server (development and tests).
    # Empty: Supabase when configured, else local in development, else photos are switched off.
    photo_storage: str = ""
    photo_bucket: str = "photos"
    photo_local_dir: str = "./media"
    # How long a photo URL works. The prompt's ceiling is 15 minutes.
    photo_url_ttl_seconds: int = 600
    photo_max_upload_mb: int = 15
    # Signs local photo URLs; a random per-process key is used when empty.
    secret_key: str = ""

    # --- Error reporting (Sentry) ---
    # Empty: off. Performance tracing is sampled (0 = errors only).
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.0

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

    @property
    def auth_configured(self) -> bool:
        return bool(self.supabase_url)

    @property
    def supabase_issuer(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v:
            raise ValueError("DATABASE_URL must be set")
        return v


    @property
    def photo_backend(self) -> str:
        """"supabase", "local", or "" (photos unavailable)."""
        if self.photo_storage:
            return self.photo_storage
        if self.supabase_url and self.supabase_service_role_key:
            return "supabase"
        return "local" if self.is_development else ""

    @model_validator(mode="after")
    def refuse_dev_bypass_outside_development(self) -> "Settings":
        if self.dev_auth_bypass and self.app_env != "development":
            raise ValueError("DEV_AUTH_BYPASS is only allowed when APP_ENV=development")
        return self

    @model_validator(mode="after")
    def check_photo_settings(self) -> "Settings":
        if self.photo_storage not in ("", "supabase", "local"):
            raise ValueError('PHOTO_STORAGE must be "supabase", "local" or empty')
        if self.photo_storage == "local" and self.app_env == "production":
            raise ValueError("Local photo storage is not allowed in production (the disk is ephemeral)")
        if not 30 <= self.photo_url_ttl_seconds <= 900:
            raise ValueError("PHOTO_URL_TTL_SECONDS must be between 30 and 900 (15 minutes)")
        return self


settings = Settings()
