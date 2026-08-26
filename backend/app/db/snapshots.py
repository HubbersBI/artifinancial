"""Portfolio value snapshots backing the P&L chart."""

from __future__ import annotations

from .connection import DEFAULT_USER_ID, connection, row_to_dict
from .util import new_id, now_iso


def append_snapshot(total_value: float, user_id: str = DEFAULT_USER_ID) -> dict:
    """Record the portfolio total value at this moment."""
    with connection() as conn:
        row = (new_id(), user_id, total_value, now_iso())
        conn.execute(
            "INSERT INTO portfolio_snapshots (id, user_id, total_value, recorded_at) "
            "VALUES (?, ?, ?, ?)",
            row,
        )
        snapshot = conn.execute(
            "SELECT * FROM portfolio_snapshots WHERE id = ?", (row[0],)
        ).fetchone()
    return row_to_dict(snapshot)


def list_snapshots(limit: int = 500, user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """The most recent snapshots, oldest first, ready to plot."""
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM portfolio_snapshots WHERE user_id = ? "
            "ORDER BY recorded_at DESC, rowid DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [row_to_dict(row) for row in reversed(rows)]
