"""Lazy initialization and seeding."""

import sqlite3

from app.db import (
    add_watchlist_ticker,
    db_path,
    get_cash_balance,
    init_db,
    list_watchlist,
    remove_watchlist_ticker,
)

DEFAULT_TICKERS = ["AAPL", "GOOGL", "MSFT", "AMZN", "TSLA", "NVDA", "META", "JPM", "V", "NFLX"]


def test_fresh_init_creates_file_and_seeds(temp_db):
    assert not temp_db.exists()
    init_db()

    assert temp_db.exists()
    assert get_cash_balance() == 10000.0
    assert list_watchlist() == DEFAULT_TICKERS


def test_first_repository_call_initializes_lazily(temp_db):
    assert not temp_db.exists()

    assert get_cash_balance() == 10000.0
    assert temp_db.exists()


def test_reinit_is_idempotent():
    init_db()
    init_db()
    init_db()

    assert list_watchlist() == DEFAULT_TICKERS
    with sqlite3.connect(db_path()) as conn:
        assert conn.execute("SELECT COUNT(*) FROM users_profile").fetchone()[0] == 1


def test_reinit_does_not_restore_user_changes():
    init_db()
    remove_watchlist_ticker("AAPL")
    add_watchlist_ticker("PYPL")

    init_db()

    tickers = list_watchlist()
    assert "AAPL" not in tickers
    assert "PYPL" in tickers


def test_all_six_tables_exist():
    init_db()
    with sqlite3.connect(db_path()) as conn:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    names = {row[0] for row in rows}
    assert {
        "users_profile",
        "watchlist",
        "positions",
        "trades",
        "portfolio_snapshots",
        "chat_messages",
    } <= names
