"""Status codes and response shapes for every REST endpoint (PLAN section 8)."""

import pytest

from app.db import upsert_position


@pytest.fixture
def priced(cache):
    """AAPL quoted at 100.00."""
    cache.update("AAPL", 100.0)
    return cache


def test_health(client, monkeypatch):
    monkeypatch.setenv("LLM_MOCK", "true")
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "llm_mock": True}


def test_health_reports_a_real_llm_instance(client, monkeypatch):
    """The E2E guard keys off this flag to refuse a destructive run."""
    monkeypatch.setenv("LLM_MOCK", "false")

    assert client.get("/api/health").json()["llm_mock"] is False


def test_get_portfolio_on_a_fresh_database(client):
    body = client.get("/api/portfolio").json()

    assert body["cash_balance"] == 10000.0
    assert body["positions"] == []
    assert body["total_value"] == 10000.0


def test_get_portfolio_values_positions(client, cache):
    upsert_position("AAPL", 10, 100.0)
    cache.update("AAPL", 110.0)

    position = client.get("/api/portfolio").json()["positions"][0]

    assert position["current_price"] == 110.0
    assert position["unrealized_pnl"] == 100.0


def test_post_trade_buys(client, priced):
    response = client.post("/api/portfolio/trade", json={"ticker": "aapl", "quantity": 10, "side": "buy"})

    assert response.status_code == 200
    body = response.json()
    assert body["trade"]["ticker"] == "AAPL"
    assert body["trade"]["price"] == 100.0
    assert body["position"]["quantity"] == 10.0
    assert body["cash_balance"] == 9000.0


def test_post_trade_closing_a_position_returns_null(client, priced):
    client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 5, "side": "buy"})
    body = client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 5, "side": "sell"}
    ).json()

    assert body["position"] is None


def test_trade_without_a_cached_price_is_400(client):
    response = client.post("/api/portfolio/trade", json={"ticker": "PYPL", "quantity": 1, "side": "buy"})

    assert response.status_code == 400
    assert response.json()["detail"] == "No price available for PYPL yet"


@pytest.mark.parametrize("quantity", [0, -3])
def test_non_positive_quantity_is_400(client, priced, quantity):
    response = client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": quantity, "side": "buy"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Quantity must be greater than 0"


def test_insufficient_cash_is_400_with_the_shortfall(client, priced):
    response = client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 150, "side": "buy"}
    )

    assert response.status_code == 400
    assert "short $5000.00" in response.json()["detail"]


def test_selling_more_than_held_is_400(client, priced):
    client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 2, "side": "buy"})
    response = client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 5, "side": "sell"}
    )

    assert response.status_code == 400
    assert "cannot sell 5 AAPL, holding 2" in response.json()["detail"]


def test_bad_side_is_422(client, priced):
    response = client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "short"}
    )

    assert response.status_code == 422


def test_non_numeric_quantity_is_422(client, priced):
    response = client.post(
        "/api/portfolio/trade", json={"ticker": "AAPL", "quantity": "ten", "side": "buy"}
    )

    assert response.status_code == 422


def test_history_is_empty_then_grows_with_each_fill(client, priced):
    assert client.get("/api/portfolio/history").json()["snapshots"] == []

    client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"})
    snapshots = client.get("/api/portfolio/history").json()["snapshots"]

    assert len(snapshots) == 1
    assert set(snapshots[0]) == {"total_value", "recorded_at"}


def test_trades_are_newest_first_and_filterable(client, cache):
    cache.update("AAPL", 100.0)
    cache.update("MSFT", 50.0)
    client.post("/api/portfolio/trade", json={"ticker": "AAPL", "quantity": 1, "side": "buy"})
    client.post("/api/portfolio/trade", json={"ticker": "MSFT", "quantity": 1, "side": "buy"})

    trades = client.get("/api/trades").json()["trades"]
    assert [t["ticker"] for t in trades] == ["MSFT", "AAPL"]

    filtered = client.get("/api/trades", params={"ticker": "aapl"}).json()["trades"]
    assert [t["ticker"] for t in filtered] == ["AAPL"]


def test_trades_limit_is_bounded(client):
    assert client.get("/api/trades", params={"limit": 0}).status_code == 422
    assert client.get("/api/trades", params={"limit": 501}).status_code == 422
