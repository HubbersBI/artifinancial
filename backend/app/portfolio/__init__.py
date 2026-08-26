"""Portfolio domain logic: trade execution, valuation, and watchlist sync.

Manual trades and LLM-initiated trades both call `execute_trade`; there is no
second code path and no second set of rules.
"""

from .errors import TradeError, WatchlistError
from .runtime import price_cache
from .trades import execute_trade
from .valuation import build_portfolio, total_value, tracked_tickers, watchlist_view
from .watchlist import add_ticker, change_watchlist, normalize, remove_ticker

__all__ = [
    "TradeError",
    "WatchlistError",
    "add_ticker",
    "build_portfolio",
    "change_watchlist",
    "execute_trade",
    "normalize",
    "price_cache",
    "remove_ticker",
    "total_value",
    "tracked_tickers",
    "watchlist_view",
]
