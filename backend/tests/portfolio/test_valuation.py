"""Portfolio valuation and the watchlist view."""

from app.db import add_watchlist_ticker, list_watchlist, upsert_position
from app.portfolio import build_portfolio, watchlist_view


def test_empty_portfolio_is_all_cash():
    portfolio = build_portfolio()

    assert portfolio["cash_balance"] == 10000.0
    assert portfolio["positions"] == []
    assert portfolio["total_value"] == 10000.0
    assert portfolio["unrealized_pnl_percent"] == 0.0


def test_position_is_marked_to_the_cached_price(cache):
    upsert_position("AAPL", 10, 100.0)
    cache.update("AAPL", 110.0)

    portfolio = build_portfolio()
    position = portfolio["positions"][0]

    assert position["current_price"] == 110.0
    assert position["market_value"] == 1100.0
    assert position["cost_basis"] == 1000.0
    assert position["unrealized_pnl"] == 100.0
    assert position["unrealized_pnl_percent"] == 10.0
    assert portfolio["total_value"] == 11100.0


def test_position_without_a_price_falls_back_to_cost(cache):
    upsert_position("PYPL", 10, 50.0)

    position = build_portfolio()["positions"][0]

    assert position["current_price"] is None
    assert position["market_value"] == 500.0
    assert position["unrealized_pnl"] == 0.0


def test_watchlist_view_carries_prices_and_holdings(cache):
    add_watchlist_ticker("PYPL")
    cache.update("AAPL", 100.0)
    cache.update("AAPL", 101.0)
    upsert_position("AAPL", 3, 90.0)

    rows = {row["ticker"]: row for row in watchlist_view()}

    assert rows["AAPL"]["price"] == 101.0
    assert rows["AAPL"]["direction"] == "up"
    assert rows["AAPL"]["position_quantity"] == 3
    assert rows["PYPL"]["price"] is None
    assert rows["PYPL"]["direction"] is None
    assert rows["PYPL"]["position_quantity"] == 0.0


def test_watchlist_view_preserves_insertion_order():
    for ticker in ("ZZZ", "AAA", "MMM"):
        add_watchlist_ticker(ticker)
    assert list_watchlist()[-3:] == ["ZZZ", "AAA", "MMM"]

    assert [row["ticker"] for row in watchlist_view()] == list_watchlist()
