"""Fixtures for LLM tests. No test here touches the network."""

import pytest

from app.db import set_db_path
from app.portfolio import TradeError, WatchlistError, runtime


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point the repository at a fresh SQLite file and default to live (non-mock) mode."""
    set_db_path(tmp_path / "test.db")
    monkeypatch.delenv("LLM_MOCK", raising=False)


@pytest.fixture(autouse=True)
def price_cache():
    """The shared runtime cache, emptied and seeded with a price for AAPL only."""
    cache = runtime.price_cache
    for ticker in list(cache.get_all()):
        cache.remove(ticker)
    cache.update("AAPL", 190.50)
    yield cache
    for ticker in list(cache.get_all()):
        cache.remove(ticker)


@pytest.fixture
def recorder():
    """Fake execute_trade / change_watchlist pair that records calls."""

    class Recorder:
        def __init__(self):
            self.trades = []
            self.changes = []
            self.trade_error: TradeError | None = None
            self.change_error: WatchlistError | None = None

        def execute_trade(self, ticker, side, quantity):
            if self.trade_error:
                raise self.trade_error
            ticker = ticker.upper()
            self.trades.append((ticker, side, quantity))
            return {
                "trade": {"ticker": ticker, "side": side, "quantity": quantity, "price": 190.50},
                "position": {"ticker": ticker, "quantity": quantity, "avg_cost": 190.50},
                "cash_balance": 8095.0,
                "total_value": 10000.0,
            }

        def change_watchlist(self, ticker, action):
            if self.change_error:
                raise self.change_error
            self.changes.append((ticker.upper(), action))

    return Recorder()
