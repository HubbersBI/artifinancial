"""The Tracked Ticker Set invariant (PLAN section 8).

The market data source tracks the union of the watchlist and every ticker with
an open position.
"""

import pytest

from app.db import list_watchlist, remove_watchlist_ticker, upsert_position
from app.portfolio import WatchlistError, add_ticker, remove_ticker, tracked_tickers


def test_startup_union_is_the_watchlist_plus_held_tickers():
    remove_watchlist_ticker("AAPL")
    upsert_position("AAPL", 5, 100.0)
    upsert_position("PYPL", 2, 60.0)

    tracked = tracked_tickers()

    assert "AAPL" in tracked, "a held ticker stays tracked after leaving the watchlist"
    assert "PYPL" in tracked, "a held ticker is tracked even if never watchlisted"
    assert set(list_watchlist()) <= set(tracked)


def test_startup_union_has_no_duplicates():
    upsert_position("AAPL", 5, 100.0)

    tracked = tracked_tickers()

    assert len(tracked) == len(set(tracked))
    assert tracked.count("AAPL") == 1


async def test_add_tracks_the_new_ticker(fake_source):
    await add_ticker("pypl")

    assert fake_source.added == ["PYPL"]
    assert "PYPL" in list_watchlist()


async def test_add_rejects_a_duplicate_without_touching_the_source(fake_source):
    with pytest.raises(WatchlistError) as exc:
        await add_ticker("AAPL")

    assert exc.value.status == 409
    assert fake_source.added == []


@pytest.mark.parametrize("bad", ["", "ABCDEF", "AA-PL", "12345"])
async def test_add_rejects_a_malformed_ticker(fake_source, bad):
    with pytest.raises(WatchlistError) as exc:
        await add_ticker(bad)

    assert exc.value.status == 400
    assert fake_source.added == []


async def test_remove_untracks_a_ticker_with_no_position(fake_source, cache):
    cache.update("AAPL", 100.0)

    await remove_ticker("AAPL")

    assert fake_source.removed == ["AAPL"]
    assert cache.get_price("AAPL") is None
    assert "AAPL" not in list_watchlist()


async def test_remove_keeps_tracking_a_held_ticker(fake_source, cache):
    cache.update("AAPL", 100.0)
    upsert_position("AAPL", 5, 90.0)

    await remove_ticker("AAPL")

    assert fake_source.removed == [], "removing a held ticker must not evict its price"
    assert cache.get_price("AAPL") == 100.0
    assert "AAPL" not in list_watchlist()


async def test_a_held_ticker_off_the_watchlist_is_still_sellable(fake_source, cache):
    from app.portfolio import execute_trade

    cache.update("AAPL", 100.0)
    execute_trade("AAPL", "buy", 5)
    await remove_ticker("AAPL")

    result = execute_trade("AAPL", "sell", 5)

    assert result["position"] is None


async def test_remove_rejects_a_ticker_not_on_the_watchlist(fake_source):
    with pytest.raises(WatchlistError) as exc:
        await remove_ticker("PYPL")

    assert exc.value.status == 404
    assert fake_source.removed == []
