"""Position reads and writes.

Carries two PLAN section 8 rules: buys recompute avg_cost as a weighted average,
and a position reaching zero is deleted rather than stored as a zero row.
"""

from __future__ import annotations

from .connection import DEFAULT_USER_ID, connection, row_to_dict
from .util import new_id, now_iso

# Quantities below this are float dust left by selling an entire position.
ZERO_QUANTITY = 1e-9


def list_positions(user_id: str = DEFAULT_USER_ID) -> list[dict]:
    """All open positions, ordered by ticker."""
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM positions WHERE user_id = ? ORDER BY ticker", (user_id,)
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def get_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> dict | None:
    """One position, or None if the ticker is not held."""
    with connection() as conn:
        row = conn.execute(
            "SELECT * FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        ).fetchone()
    return row_to_dict(row) if row else None


def upsert_position(
    ticker: str, quantity: float, avg_cost: float, user_id: str = DEFAULT_USER_ID
) -> dict | None:
    """Insert or update a position. A quantity of zero deletes it and returns None."""
    if quantity <= ZERO_QUANTITY:
        delete_position(ticker, user_id)
        return None
    with connection() as conn:
        conn.execute(
            "INSERT INTO positions (id, user_id, ticker, quantity, avg_cost, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT (user_id, ticker) DO UPDATE SET "
            "quantity = excluded.quantity, avg_cost = excluded.avg_cost, "
            "updated_at = excluded.updated_at",
            (new_id(), user_id, ticker, quantity, avg_cost, now_iso()),
        )
        row = conn.execute(
            "SELECT * FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        ).fetchone()
    return row_to_dict(row)


def delete_position(ticker: str, user_id: str = DEFAULT_USER_ID) -> bool:
    """Delete a position. Returns True if a row was deleted."""
    with connection() as conn:
        cursor = conn.execute(
            "DELETE FROM positions WHERE user_id = ? AND ticker = ?", (user_id, ticker)
        )
    return cursor.rowcount > 0


def apply_buy(
    ticker: str, quantity: float, price: float, user_id: str = DEFAULT_USER_ID
) -> dict:
    """Add shares, recomputing avg_cost as the weighted average of the lots."""
    existing = get_position(ticker, user_id)
    if existing is None:
        return upsert_position(ticker, quantity, price, user_id)

    total_quantity = existing["quantity"] + quantity
    avg_cost = (existing["quantity"] * existing["avg_cost"] + quantity * price) / total_quantity
    return upsert_position(ticker, total_quantity, avg_cost, user_id)


def apply_sell(ticker: str, quantity: float, user_id: str = DEFAULT_USER_ID) -> dict | None:
    """Remove shares, leaving avg_cost unchanged. Returns None once flat."""
    existing = get_position(ticker, user_id)
    if existing is None:
        return None
    remaining = existing["quantity"] - quantity
    return upsert_position(ticker, remaining, existing["avg_cost"], user_id)
