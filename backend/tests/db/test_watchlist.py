"""Watchlist CRUD."""

import sqlite3

import pytest

from app.db import add_watchlist_ticker, list_watchlist, remove_watchlist_ticker


def test_add_returns_the_row():
    row = add_watchlist_ticker("PYPL")

    assert row["ticker"] == "PYPL"
    assert row["user_id"] == "default"
    assert len(row["id"]) == 36
    assert "PYPL" in list_watchlist()


def test_added_ticker_goes_to_the_end():
    add_watchlist_ticker("PYPL")

    assert list_watchlist()[-1] == "PYPL"


def test_duplicate_ticker_violates_unique_constraint():
    add_watchlist_ticker("PYPL")

    with pytest.raises(sqlite3.IntegrityError):
        add_watchlist_ticker("PYPL")


def test_seeded_ticker_is_a_duplicate_too():
    with pytest.raises(sqlite3.IntegrityError):
        add_watchlist_ticker("AAPL")


def test_remove_reports_whether_a_row_went():
    assert remove_watchlist_ticker("AAPL") is True
    assert "AAPL" not in list_watchlist()
    assert remove_watchlist_ticker("AAPL") is False
