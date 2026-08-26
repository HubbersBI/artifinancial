"""The /api/chat and /api/chat/history endpoints, driven in mock mode."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from litellm.exceptions import RateLimitError

from app.api import chat as chat_api
from app.llm import ChatService
from app.portfolio import TradeError


@pytest.fixture
def client(recorder, monkeypatch):
    """App mounting the real router with the recorder standing in for the portfolio layer."""
    monkeypatch.setenv("LLM_MOCK", "true")
    monkeypatch.setattr(
        chat_api, "service", ChatService(recorder.execute_trade, recorder.change_watchlist)
    )
    app = FastAPI()
    app.include_router(chat_api.router)
    return TestClient(app)


def test_router_carries_its_own_prefix():
    assert {route.path for route in chat_api.router.routes} == {
        "/api/chat",
        "/api/chat/history",
    }


def test_plain_reply_has_both_action_arrays(client):
    body = client.post("/api/chat", json={"message": "how is my portfolio?"}).json()
    assert body["trades"] == []
    assert body["watchlist_changes"] == []
    assert body["message"]
    assert body["created_at"]


def test_trade_is_executed_and_returned(client, recorder):
    body = client.post("/api/chat", json={"message": "buy 5 AAPL"}).json()
    assert recorder.trades == [("AAPL", "buy", 5.0)]
    assert body["trades"][0]["status"] == "executed"
    assert body["trades"][0]["price"] == 190.50


def test_rejected_trade_still_returns_200(client, recorder):
    recorder.trade_error = TradeError("No price available for PYPL yet")
    response = client.post("/api/chat", json={"message": "buy 1 PYPL"})
    assert response.status_code == 200
    assert response.json()["trades"][0]["error"] == "No price available for PYPL yet"


def test_watchlist_change_is_executed(client, recorder):
    body = client.post("/api/chat", json={"message": "add PYPL to my watchlist"}).json()
    assert recorder.changes == [("PYPL", "add")]
    assert body["watchlist_changes"][0]["status"] == "executed"


def test_empty_message_is_rejected(client):
    assert client.post("/api/chat", json={"message": "   "}).status_code == 400


def test_history_is_oldest_first_with_actions(client):
    client.post("/api/chat", json={"message": "buy 5 AAPL"})
    messages = client.get("/api/chat/history").json()["messages"]

    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["actions"] is None
    assert messages[1]["actions"]["trades"][0]["ticker"] == "AAPL"


def test_history_respects_the_limit(client):
    for i in range(5):
        client.post("/api/chat", json={"message": f"question {i}"})
    assert len(client.get("/api/chat/history", params={"limit": 4}).json()["messages"]) == 4


def test_rate_limit_becomes_429(client, monkeypatch):
    monkeypatch.delenv("LLM_MOCK", raising=False)

    def limited(messages):
        raise RateLimitError(
            message="slow down", llm_provider="groq", model="groq/openai/gpt-oss-120b"
        )

    monkeypatch.setattr("app.llm.service.complete", limited)
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 429


def test_unparseable_model_response_becomes_502(client, monkeypatch):
    monkeypatch.delenv("LLM_MOCK", raising=False)

    def bad(messages):
        from app.llm.schema import ChatResponse

        return ChatResponse.model_validate_json('{"message": "hi"}')

    monkeypatch.setattr("app.llm.service.complete", bad)
    assert client.post("/api/chat", json={"message": "hi"}).status_code == 502
