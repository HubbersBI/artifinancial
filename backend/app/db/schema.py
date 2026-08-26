"""Schema creation and default seed data."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .connection import DEFAULT_USER_ID, mark_initialized, open_connection
from .util import new_id, now_iso

SCHEMA_FILE = Path(__file__).with_name("schema.sql")
SEED_FILE = Path(__file__).with_name("seed.json")


def init_db() -> None:
    """Create the file, the tables and the seed rows if they are missing."""
    create_and_seed()
    mark_initialized()


def create_and_seed() -> None:
    """Apply the schema, then seed the default profile and watchlist once."""
    conn = open_connection()
    try:
        with conn:
            conn.executescript(SCHEMA_FILE.read_text())
            _seed(conn)
    finally:
        conn.close()


def _seed(conn: sqlite3.Connection) -> None:
    """Insert the default profile and tickers unless the profile already exists."""
    existing = conn.execute(
        "SELECT 1 FROM users_profile WHERE id = ?", (DEFAULT_USER_ID,)
    ).fetchone()
    if existing:
        return

    seed = json.loads(SEED_FILE.read_text())
    now = now_iso()
    conn.execute(
        "INSERT INTO users_profile (id, cash_balance, created_at) VALUES (?, ?, ?)",
        (DEFAULT_USER_ID, seed["cash_balance"], now),
    )
    conn.executemany(
        "INSERT INTO watchlist (id, user_id, ticker, added_at) VALUES (?, ?, ?, ?)",
        [(new_id(), DEFAULT_USER_ID, ticker, now) for ticker in seed["tickers"]],
    )
