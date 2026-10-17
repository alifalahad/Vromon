"""
Vromon Backend — crash and error reporting (Sentry), off unless SENTRY_DSN is set.

No personal data is sent: request bodies, cookies, headers with tokens and IP
addresses are left out (`send_default_pii=False`), and the Authorization header
is scrubbed by Sentry's default denylist.
"""

from __future__ import annotations

import logging

from app.core.config import settings

logger = logging.getLogger("vromon.monitoring")


def setup_monitoring() -> bool:
    """Start Sentry when configured. Returns whether it is on."""
    if not settings.sentry_dsn:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        send_default_pii=False,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        max_request_body_size="never",
    )
    logger.info("Sentry error reporting is on (%s)", settings.app_env)
    return True
