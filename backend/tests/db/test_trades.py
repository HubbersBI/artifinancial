"""Append-only trade log."""

from app.db import append_trade, list_trades


def test_append_returns_the_stored_trade():
    trade = append_trade("AAPL", "buy", 10, 190.0)

    assert trade["side"] == "buy"
    assert trade["quantity"] == 10
    assert trade["price"] == 190.0
    assert trade["executed_at"].startswith("20")


def test_history_is_newest_first():
    append_trade("AAPL", "buy", 1, 100.0)
    append_trade("TSLA", "buy", 2, 200.0)
    append_trade("AAPL", "sell", 1, 110.0)

    assert [t["ticker"] for t in list_trades()] == ["AAPL", "TSLA", "AAPL"]
    assert list_trades()[0]["side"] == "sell"


def test_history_filters_by_ticker():
    append_trade("AAPL", "buy", 1, 100.0)
    append_trade("TSLA", "buy", 2, 200.0)

    trades = list_trades(ticker="TSLA")

    assert len(trades) == 1
    assert trades[0]["ticker"] == "TSLA"


def test_history_respects_the_limit():
    for _ in range(5):
        append_trade("AAPL", "buy", 1, 100.0)

    assert len(list_trades(limit=2)) == 2


def test_trades_accumulate():
    append_trade("AAPL", "buy", 1, 100.0)
    append_trade("AAPL", "sell", 1, 100.0)

    assert len(list_trades()) == 2
