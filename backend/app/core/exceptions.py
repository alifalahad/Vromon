"""
Vromon Backend — Custom exception classes.
"""

from __future__ import annotations


class VromonError(Exception):
    """Base exception for all Vromon errors."""

    def __init__(self, message: str, detail: str | None = None):
        self.message = message
        self.detail = detail
        super().__init__(message)


class NotFoundError(VromonError):
    """Resource not found."""
    pass


class ValidationError(VromonError):
    """Input validation failed."""
    pass


class ConfigurationError(VromonError):
    """Configuration error (missing keys, invalid setup)."""
    pass


class ExternalServiceError(VromonError):
    """External service (LLM, embedding) failed."""
    pass


class InsufficientDataError(VromonError):
    """Not enough data to produce a meaningful result."""
    pass
