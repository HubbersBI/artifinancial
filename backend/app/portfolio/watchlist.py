"""Watchlist changes that keep the Tracked Ticker Set invariant (PLAN section 8)."""

from __future__ import annotations

import re
import sqlite3

from anyio.from_thread import run as run_async

from app.db import add_watchlist_ticker, get_position, remove_watchlist_ticker

from . import runtime
from .errors import WatchlistError

TICKER_PATTERN = re.compile(r"^[A-Z]{1,5}$")


def normalize(ticker: str) -> str:
    """Uppercase and format-validate a ticker. There is no symbol-existence check."""
    ticker = ticker.strip().upper()
    if not TICKER_PATTERN.match(ticker):
        raise WatchlistError(f"Invalid ticker: '{ticker}'", status=400)
    return ticker


async def add_ticker(ticker: str) -> dict:
    """Add a ticker to the watchlist and start tracking its price."""
    ticker = normalize(ticker)
    try:
        row = add_watchlist_ticker(ticker)
    except sqlite3.IntegrityError:
        raise WatchlistError(f"{ticker} is already on the watchlist", status=409) from None
    await runtime.source.add_ticker(ticker)
    return {"ticker": ticker, "added_at": row["added_at"]}


async def remove_ticker(ticker: str) -> dict:
    """Remove a ticker from the watchlist, untracking it only if nothing is held.

    `remove_ticker()` on the source also evicts the price from the shared cache.
    Doing that while a position is open would strand the holding at a stale value
    and make it unsellable under the no-cached-price rule, so a held ticker stays
    tracked even once it leaves the watchlist.
    """
    ticker = normalize(ticker)
    if not remove_watchlist_ticker(ticker):
        raise WatchlistError(f"{ticker} is not on the watchlist", status=404)
    if get_position(ticker) is None:
        await runtime.source.remove_ticker(ticker)
    return {"ticker": ticker, "removed": True}


def change_watchlist(ticker: str, action: str) -> None:
    """Apply a watchlist change from a synchronous request handler.

    The chat router's endpoint is sync, so FastAPI runs it in an anyio worker
    thread; this bridges back to the event loop the market data source lives on.
    """
    if action == "add":
        run_async(add_ticker, ticker)
    elif action == "remove":
        run_async(remove_ticker, ticker)
    else:
        raise WatchlistError(f"Unknown watchlist action: '{action}'")
