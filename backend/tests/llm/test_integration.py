"""The chat turn against the real portfolio layer, in mock mode. Still no network."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import chat as chat_api
from app.db import get_cash_balance, list_positions, list_watchlist
from app.portfolio import runtime


class FakeSource:
    """Stands in for the market data source so ticker sync can be observed."""

    def __init__(self):
        self.added = []
        self.removed = []

    async def add_ticker(self, ticker):
        self.added.append(ticker)

    async def remove_ticker(self, ticker):
        self.removed.append(ticker)


@pytest.fixture
def client(monkeypatch):
    """Real execute_trade and change_watchlist, mock LLM, fake market data source."""
    monkeypatch.setenv("LLM_MOCK", "true")
    monkeypatch.setattr(runtime, "source", FakeSource())
    app = FastAPI()
    app.include_router(chat_api.router)
    return TestClient(app)


def test_buy_through_chat_moves_real_cash_and_creates_a_position(client):
    body = client.post("/api/chat", json={"message": "buy 5 AAPL"}).json()

    assert body["trades"][0] == {
        "ticker": "AAPL",
        "side": "buy",
        "quantity": 5.0,
        "price": 190.50,
        "status": "executed",
        "error": None,
    }
    assert get_cash_balance() == pytest.approx(10000.0 - 5 * 190.50)
    assert [(p["ticker"], p["quantity"]) for p in list_positions()] == [("AAPL", 5.0)]


def test_insufficient_cash_is_reported_not_raised(client):
    response = client.post("/api/chat", json={"message": "buy 1000 AAPL"})

    assert response.status_code == 200
    trade = response.json()["trades"][0]
    assert trade["status"] == "rejected"
    assert "cash" in trade["error"].lower()
    assert get_cash_balance() == 10000.0
    assert list_positions() == []


def test_trading_a_ticker_with_no_cached_price_is_rejected(client):
    trade = client.post("/api/chat", json={"message": "buy 1 PYPL"}).json()["trades"][0]
    assert trade["status"] == "rejected"
    assert trade["error"] == "No price available for PYPL yet"


def test_watchlist_add_through_chat_updates_db_and_tracks_the_ticker(client):
    body = client.post("/api/chat", json={"message": "add PYPL to my watchlist"}).json()

    assert body["watchlist_changes"][0]["status"] == "executed"
    assert "PYPL" in list_watchlist()
    assert runtime.source.added == ["PYPL"]


def test_duplicate_watchlist_add_is_reported_not_raised(client):
    response = client.post("/api/chat", json={"message": "add AAPL to my watchlist"})

    assert response.status_code == 200
    change = response.json()["watchlist_changes"][0]
    assert change["status"] == "rejected"
    assert change["error"] == "AAPL is already on the watchlist"


def test_watchlist_remove_through_chat_untracks_an_unheld_ticker(client):
    body = client.post("/api/chat", json={"message": "remove TSLA from the watchlist"}).json()

    assert body["watchlist_changes"][0]["status"] == "executed"
    assert "TSLA" not in list_watchlist()
    assert runtime.source.removed == ["TSLA"]


def test_conversation_survives_via_history(client):
    client.post("/api/chat", json={"message": "buy 5 AAPL"})
    client.post("/api/chat", json={"message": "how am I doing?"})

    messages = client.get("/api/chat/history").json()["messages"]
    assert [m["role"] for m in messages] == ["user", "assistant", "user", "assistant"]
    assert messages[1]["actions"]["trades"][0]["status"] == "executed"
    assert messages[3]["actions"] == {"trades": [], "watchlist_changes": []}
