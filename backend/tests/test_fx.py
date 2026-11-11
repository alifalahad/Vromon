"""
Exchange rates from taka (GET /api/v1/fx/rates): fetched once and kept, served stale when the
service is down, a 503 when there were never any. No network: the HTTP call is replaced.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import fx

GOOD = {"result": "success", "base_code": "BDT", "time_last_update_unix": 1794355352, "rates": {"BDT": 1, "USD": 0.008025, "INR": 0.754316, "BAD": "x"}}


class _Resp:
    def __init__(self, status: int, body: dict):
        self.status_code = status
        self._body = body

    def json(self):
        return self._body


@pytest.fixture(autouse=True)
def fresh():
    fx.reset_cache()
    yield
    fx.reset_cache()


@pytest.fixture
def client():
    return TestClient(app)


def test_rates_are_fetched_once_and_kept(monkeypatch, client):
    calls = []

    def fake_get(url, timeout):
        calls.append(url)
        return _Resp(200, GOOD)

    monkeypatch.setattr(fx.httpx, "get", fake_get)
    first = client.get("/api/v1/fx/rates")
    second = client.get("/api/v1/fx/rates")
    assert first.status_code == 200 and second.status_code == 200
    body = first.json()
    assert body["base"] == "BDT"
    assert body["rates"] == {"BDT": 1.0, "USD": 0.008025, "INR": 0.754316}  # junk values dropped
    assert body["stale"] is False
    assert body["source"] == "ExchangeRate-API"
    assert body["updated_at"].startswith("2026-11-11")
    assert len(calls) == 1


def test_stale_rates_when_the_service_is_down(monkeypatch, client):
    monkeypatch.setattr(fx.httpx, "get", lambda url, timeout: _Resp(200, GOOD))
    assert client.get("/api/v1/fx/rates").status_code == 200

    def down(url, timeout):
        raise httpx.ConnectError("no network")

    monkeypatch.setattr(fx.httpx, "get", down)
    monkeypatch.setattr(fx.settings, "fx_cache_hours", 0.0)  # the kept rates are old now
    r = client.get("/api/v1/fx/rates")
    assert r.status_code == 200
    assert r.json()["stale"] is True
    assert r.json()["rates"]["USD"] == 0.008025


def test_no_rates_ever_is_a_503(monkeypatch, client):
    monkeypatch.setattr(fx.httpx, "get", lambda url, timeout: _Resp(500, {}))
    assert client.get("/api/v1/fx/rates").status_code == 503
    monkeypatch.setattr(fx.httpx, "get", lambda url, timeout: _Resp(200, {"result": "error", "error-type": "unsupported-code"}))
    assert client.get("/api/v1/fx/rates").status_code == 503
