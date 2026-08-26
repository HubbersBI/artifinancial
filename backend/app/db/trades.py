"""Append-only trade log."""

from __future__ import annotations

from .connection import DEFAULT_USER_ID, connection, row_to_dict
from .util import new_id, now_iso


def append_trade(
    ticker: str, side: str, quantity: float, price: float, user_id: str = DEFAULT_USER_ID
) -> dict:
    """Record a fill. Side is "buy" or "sell"."""
    with connection() as conn:
        row = (new_id(), user_id, ticker, side, quantity, price, now_iso())
        conn.execute(
            "INSERT INTO trades (id, user_id, ticker, side, quantity, price, executed_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            row,
        )
        trade = conn.execute("SELECT * FROM trades WHERE id = ?", (row[0],)).fetchone()
    return row_to_dict(trade)


def list_trades(
    limit: int = 50, ticker: str | None = None, user_id: str = DEFAULT_USER_ID
) -> list[dict]:
    """Trade history, newest first, optionally filtered by ticker."""
    sql = "SELECT * FROM trades WHERE user_id = ?"
    params: list = [user_id]
    if ticker:
        sql += " AND ticker = ?"
        params.append(ticker)
    sql += " ORDER BY executed_at DESC, rowid DESC LIMIT ?"
    params.append(limit)

    with connection() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [row_to_dict(row) for row in rows]
