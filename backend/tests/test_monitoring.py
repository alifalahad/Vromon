"""Error reporting stays off without a DSN, and never sends personal data when on."""

from __future__ import annotations

import sentry_sdk

from app.core import monitoring
from app.core.config import settings


def test_off_without_a_dsn(monkeypatch):
    monkeypatch.setattr(settings, "sentry_dsn", "")
    assert monitoring.setup_monitoring() is False


def test_on_with_a_dsn_and_no_personal_data(monkeypatch):
    seen = {}
    monkeypatch.setattr(settings, "sentry_dsn", "https://public@o0.ingest.sentry.io/0")
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: seen.update(kw))
    assert monitoring.setup_monitoring() is True
    assert seen["send_default_pii"] is False and seen["max_request_body_size"] == "never"
    assert seen["environment"] == settings.app_env
