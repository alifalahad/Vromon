"""
Vromon — LLM provider interface.

One configurable provider (Google Gemini via the official google-genai SDK)
behind a small interface, so generation code never imports a vendor SDK.

There is deliberately no fake/dummy LLM here: when no provider is configured,
get_llm_provider() raises LLMNotConfiguredError and callers report that
explicitly instead of returning invented text. Tests inject their own fakes.

Usage:
    llm = get_llm_provider()
    answer = llm.generate_structured(system=..., prompt=..., schema=MyModel)
"""

from __future__ import annotations

import logging
from typing import Protocol, TypeVar

from pydantic import BaseModel, ValidationError

logger = logging.getLogger("vromon.llm")

T = TypeVar("T", bound=BaseModel)


class LLMError(Exception):
    """Base class for LLM failures."""


class LLMNotConfiguredError(LLMError):
    """No LLM provider/API key is configured."""


class LLMProviderError(LLMError):
    """The provider call failed or returned output that does not match the schema."""


class LLMProvider(Protocol):
    """Interface that all LLM providers must satisfy."""

    @property
    def model_name(self) -> str: ...

    def generate_structured(self, system: str, prompt: str, schema: type[T]) -> T:
        """Generate a response that validates against the given Pydantic schema."""
        ...


def describe_provider_error(exc: Exception) -> str:
    """Short, secret-free description of an SDK error, e.g. '429 RESOURCE_EXHAUSTED'."""
    code = getattr(exc, "code", None)
    status = getattr(exc, "status", None)
    if code is not None and status:
        return f"{code} {status}"
    return type(exc).__name__


# ---------------------------------------------------------------------------
# Gemini provider
# ---------------------------------------------------------------------------

class GeminiLLMProvider:
    """Google Gemini via google-genai, using JSON structured output."""

    def __init__(
        self,
        api_key: str,
        model: str,
        temperature: float = 0.2,
        timeout_seconds: float = 30.0,
        client=None,
    ):
        if client is None:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore
            client = genai.Client(
                api_key=api_key,
                http_options=types.HttpOptions(timeout=int(timeout_seconds * 1000)),
            )
        self._client = client
        self._model = model
        self._temperature = temperature

    @property
    def model_name(self) -> str:
        return self._model

    def generate_structured(self, system: str, prompt: str, schema: type[T]) -> T:
        from google.genai import types  # type: ignore

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    temperature=self._temperature,
                    response_mime_type="application/json",
                    response_schema=schema,
                    # No tools are passed; disable AFC explicitly (avoids SDK warnings).
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                ),
            )
        except Exception as exc:
            logger.error(f"Gemini request failed: {type(exc).__name__}: {exc}")
            raise LLMProviderError(f"LLM request failed: {describe_provider_error(exc)}") from exc

        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, schema):
            return parsed

        # Fall back to validating the raw JSON text ourselves
        text = getattr(response, "text", None)
        if not text:
            raise LLMProviderError("LLM returned an empty response")
        try:
            return schema.model_validate_json(text)
        except ValidationError as exc:
            logger.error(f"Gemini output failed schema validation: {exc}")
            raise LLMProviderError("LLM output did not match the expected schema") from exc


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_llm_provider() -> LLMProvider:
    """
    Returns the configured LLM provider.

    Raises LLMNotConfiguredError if LLM_PROVIDER / LLM_API_KEY are not set,
    and LLMProviderError if the SDK cannot be initialised.
    """
    from app.core.config import settings

    if not settings.has_llm:
        raise LLMNotConfiguredError(
            "No LLM configured. Set LLM_PROVIDER=gemini and LLM_API_KEY in backend/.env."
        )
    try:
        return GeminiLLMProvider(
            api_key=settings.llm_api_key,
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            timeout_seconds=settings.llm_timeout_seconds,
        )
    except Exception as exc:
        raise LLMProviderError(f"Could not initialise LLM provider: {type(exc).__name__}") from exc
