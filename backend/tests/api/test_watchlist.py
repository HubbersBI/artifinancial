"""Watchlist endpoints and the ticker tracking they drive (PLAN section 8)."""

from app.db import upsert_position


def test_get_watchlist_returns_the_seeded_tickers(client):
    body = client.get("/api/watchlist").json()

    assert [row["ticker"] for row in body["watchlist"]][:3] == ["AAPL", "GOOGL", "MSFT"]
    assert body["watchlist"][0]["price"] is None


def test_get_watchlist_carries_cached_prices(client, cache):
    cache.update("AAPL", 100.0)
    cache.update("AAPL", 101.0)

    row = next(r for r in client.get("/api/watchlist").json()["watchlist"] if r["ticker"] == "AAPL")

    assert row["price"] == 101.0
    assert row["direction"] == "up"


def test_add_returns_201_and_tracks_the_ticker(client, fake_source):
    response = client.post("/api/watchlist", json={"ticker": "pypl"})

    assert response.status_code == 201
    assert response.json()["ticker"] == "PYPL"
    assert fake_source.added == ["PYPL"]


def test_add_duplicate_is_409(client, fake_source):
    response = client.post("/api/watchlist", json={"ticker": "AAPL"})

    assert response.status_code == 409
    assert response.json()["detail"] == "AAPL is already on the watchlist"
    assert fake_source.added == []


def test_add_malformed_ticker_is_400(client, fake_source):
    response = client.post("/api/watchlist", json={"ticker": "ABCDEF"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid ticker: 'ABCDEF'"
    assert fake_source.added == []


def test_delete_untracks_a_ticker_with_no_position(client, fake_source, cache):
    cache.update("AAPL", 100.0)

    response = client.delete("/api/watchlist/AAPL")

    assert response.status_code == 200
    assert response.json() == {"ticker": "AAPL", "removed": True}
    assert fake_source.removed == ["AAPL"]
    assert cache.get_price("AAPL") is None


def test_delete_keeps_tracking_a_held_ticker(client, fake_source, cache):
    cache.update("AAPL", 100.0)
    upsert_position("AAPL", 5, 90.0)

    client.delete("/api/watchlist/AAPL")

    assert fake_source.removed == []
    assert cache.get_price("AAPL") == 100.0

    position = client.get("/api/portfolio").json()["positions"][0]
    assert position["current_price"] == 100.0


def test_delete_unknown_ticker_is_404(client, fake_source):
    response = client.delete("/api/watchlist/PYPL")

    assert response.status_code == 404
    assert response.json()["detail"] == "PYPL is not on the watchlist"
    assert fake_source.removed == []


def test_delete_malformed_ticker_is_400(client):
    assert client.delete("/api/watchlist/ABCDEF").status_code == 400
