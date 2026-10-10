"""
Vromon Backend — Core configuration module.

Loads settings from environment variables and .env file.
Validates all required configuration at startup.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    llm_model: str = "gemini-2.0-flash"

    # --- Embeddings ---
    embedding_provider: str = ""
    embedding_api_key: str = ""
    embedding_model: str = "text-embedding-004"
    embedding_dimension: int = 768

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
        return bool(self.llm_api_key and self.llm_provider)

    @property
    def has_embeddings(self) -> bool:
        return bool(self.embedding_api_key and self.embedding_provider)

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v:
            raise ValueError("DATABASE_URL must be set")
        return v


settings = Settings()
