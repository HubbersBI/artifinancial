"""Cash balance access for the user profile."""

from __future__ import annotations

from .connection import DEFAULT_USER_ID, connection


def get_cash_balance(user_id: str = DEFAULT_USER_ID) -> float:
    """Current cash balance."""
    with connection() as conn:
        row = conn.execute(
            "SELECT cash_balance FROM users_profile WHERE id = ?", (user_id,)
        ).fetchone()
    return row["cash_balance"]


def set_cash_balance(cash: float, user_id: str = DEFAULT_USER_ID) -> None:
    """Overwrite the cash balance."""
    with connection() as conn:
        conn.execute("UPDATE users_profile SET cash_balance = ? WHERE id = ?", (cash, user_id))


def adjust_cash_balance(delta: float, user_id: str = DEFAULT_USER_ID) -> float:
    """Apply a delta in a single UPDATE and return the new balance."""
    with connection() as conn:
        row = conn.execute(
            "UPDATE users_profile SET cash_balance = cash_balance + ? WHERE id = ? "
            "RETURNING cash_balance",
            (delta, user_id),
        ).fetchone()
    return row["cash_balance"]
