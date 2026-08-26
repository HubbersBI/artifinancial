"""Watchlist CRUD."""

from __future__ import annotations

from .connection import DEFAULT_USER_ID, connection, row_to_dict
from .util import new_id, now_iso


def list_watchlist(user_id: str = DEFAULT_USER_ID) -> list[str]:
    """Watched tickers, oldest addition first."""
    with connection() as conn:
        rows = conn.execute(
            "SELECT ticker FROM watchlist WHERE user_id = ? ORDER BY added_at, rowid",
            (user_id,),
        ).fetchall()
    return [row["ticker"] for row in rows]


def add_watchlist_ticker(ticker: str, user_id: str = DEFAULT_USER_ID) -> dict:
    """Add a ticker. Raises sqlite3.IntegrityError if it is already watched."""
    with connection() as conn:
        row = (new_id(), user_id, ticker, now_iso())
        conn.execute(
            "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)", row
        )
        added = conn.execute("SELECT * FROM watchlist WHERE id = ?", (row[0],)).fetchone()
    return row_to_dict(added)


def remove_watchlist_ticker(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool:
    """Remove a ticker. Returns True if a row was deleted."""
    with connection() as conn:
        cursor = conn.execute(
            "DELETE FROM watchlist WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        )
    return cursor.rowcount > 0
