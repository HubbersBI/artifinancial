"""Data access for Artifinancial.

Every read and write goes through these functions; no other module writes SQL.
The database initializes itself lazily on first use.
"""

from .chat import append_chat_message, list_chat_messages
from .connection import DEFAULT_USER_ID, db_path, set_db_path
from .positions import (
    apply_buy,
    apply_sell,
    delete_position,
    get_position,
    list_positions,
    upsert_position,
)
from .profile import adjust_cash_balance, get_cash_balance, set_cash_balance
from .schema import init_db
from .snapshots import append_snapshot, list_snapshots
from .trades import append_trade, list_trades
from .watchlist import add_watchlist_ticker, list_watchlist, remove_watchlist_ticker

__all__ = [
    "DEFAULT_USER_ID",
    "add_watchlist_ticker",
    "adjust_cash_balance",
    "append_chat_message",
    "append_snapshot",
    "append_trade",
    "apply_buy",
    "apply_sell",
    "db_path",
    "delete_position",
    "get_cash_balance",
    "get_position",
    "init_db",
    "list_chat_messages",
    "list_positions",
    "list_snapshots",
    "list_trades",
    "list_watchlist",
    "remove_watchlist_ticker",
    "set_cash_balance",
    "set_db_path",
    "upsert_position",
]
