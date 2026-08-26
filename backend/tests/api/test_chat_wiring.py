"""LLM-initiated actions must go through the same functions as manual ones."""

import pytest
from anyio import to_thread
from litellm.exceptions import (
    APIConnectionError,
    BadRequestError,
    RateLimitError,
    ServiceUnavailableError,
)

from app.api.chat import provider_reason
from app.db import get_position, list_chat_messages, list_watchlist, upsert_position
from app.llm.client import MODEL
from app.portfolio import WatchlistError, change_watchlist


@pytest.fixture(autouse=True)
def mock_llm(monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")


def test_chat_routes_are_mounted(client):
    paths = {route.path for route in client.app.routes}

    assert {"/api/chat", "/api/chat/history"} <= paths


def test_chat_trade_uses_the_shared_execution_path(client, cache):
    cache.update("AAPL", 100.0)

    body = client.post("/api/chat", json={"message": "buy 3 AAPL"}).json()

    assert body["trades"][0] == {
        "ticker": "AAPL",
        "side": "buy",
        "quantity": 3.0,
        "price": 100.0,
        "status": "executed",
        "error": None,
    }
    assert get_position("AAPL")["quantity"] == 3.0


def test_chat_trade_reports_the_same_rejection_as_the_rest_layer(client):
    body = client.post("/api/chat", json={"message": "buy 3 PYPL"}).json()

    assert body["trades"][0]["status"] == "rejected"
    assert body["trades"][0]["error"] == "No price available for PYPL yet"
    assert get_position("PYPL") is None


def test_chat_watchlist_add_tracks_the_ticker(client, fake_source):
    body = client.post("/api/chat", json={"message": "watch PYPL"}).json()

    assert body["watchlist_changes"][0]["status"] == "executed"
    assert "PYPL" in list_watchlist()
    assert fake_source.added == ["PYPL"]


def test_chat_watchlist_remove_keeps_tracking_a_held_ticker(client, fake_source, cache):
    cache.update("AAPL", 100.0)
    upsert_position("AAPL", 2, 90.0)

    client.post("/api/chat", json={"message": "remove AAPL"})

    assert "AAPL" not in list_watchlist()
    assert fake_source.removed == []
    assert cache.get_price("AAPL") == 100.0


async def test_change_watchlist_bridges_from_a_worker_thread(fake_source):
    await to_thread.run_sync(change_watchlist, "PYPL", "add")

    assert fake_source.added == ["PYPL"]
    assert "PYPL" in list_watchlist()


async def test_change_watchlist_rejects_an_unknown_action(fake_source):
    with pytest.raises(WatchlistError):
        await to_thread.run_sync(change_watchlist, "PYPL", "flip")


class TestProviderFailures:
    """A provider failure must reach the user as a readable message, never a 500.

    Regression: an unset or placeholder GROQ_API_KEY made Groq reject the call,
    and only RateLimitError was caught, so the turn surfaced as a bare 500 with
    a stack trace and nothing the user could act on.
    """

    @staticmethod
    def _raise(client, monkeypatch, exc):
        monkeypatch.setenv("LLM_MOCK", "false")
        monkeypatch.setattr(
            "app.llm.service.complete", lambda messages: (_ for _ in ()).throw(exc)
        )
        return client.post("/api/chat", json={"message": "hello"})

    def test_invalid_api_key_is_a_502_naming_the_reason(self, client, monkeypatch):
        # Groq reports an invalid key as a 400 BadRequestError, not an auth error.
        exc = BadRequestError(
            message=(
                'litellm.BadRequestError: GroqException - {"error":{"message":'
                '"Invalid API Key","type":"invalid_request_error","code":"invalid_api_key"}}'
            ),
            model=MODEL,
            llm_provider="groq",
        )

        response = self._raise(client, monkeypatch, exc)

        assert response.status_code == 502
        assert response.json()["detail"] == "The assistant is unavailable: Invalid API Key"

    def test_a_connection_failure_is_a_502(self, client, monkeypatch):
        exc = APIConnectionError(message="Connection refused", model=MODEL, llm_provider="groq")

        response = self._raise(client, monkeypatch, exc)

        assert response.status_code == 502
        assert "The assistant is unavailable" in response.json()["detail"]

    def test_an_upstream_outage_is_a_502(self, client, monkeypatch):
        exc = ServiceUnavailableError(
            message="Service Unavailable", model=MODEL, llm_provider="groq"
        )

        response = self._raise(client, monkeypatch, exc)

        assert response.status_code == 502

    def test_rate_limiting_still_wins_over_the_general_handler(self, client, monkeypatch):
        # RateLimitError subclasses APIError, so ordering decides which one runs.
        exc = RateLimitError(message="Rate limit reached", model=MODEL, llm_provider="groq")

        response = self._raise(client, monkeypatch, exc)

        assert response.status_code == 429
        assert response.json()["detail"] == "The assistant is rate limited, try again shortly"

    def test_a_failed_turn_is_not_written_to_history(self, client, monkeypatch):
        exc = APIConnectionError(message="Connection refused", model=MODEL, llm_provider="groq")

        self._raise(client, monkeypatch, exc)

        assert list_chat_messages(limit=50) == []


def test_provider_reason_unwraps_the_litellm_envelope():
    exc = BadRequestError(
        message='litellm.BadRequestError: GroqException - {"error":{"message":"Invalid API Key"}}',
        model=MODEL,
        llm_provider="groq",
    )

    assert provider_reason(exc) == "Invalid API Key"


def test_provider_reason_falls_back_to_raw_text_without_an_envelope():
    exc = APIConnectionError(message="Connection refused", model=MODEL, llm_provider="groq")

    assert "Connection refused" in provider_reason(exc)
