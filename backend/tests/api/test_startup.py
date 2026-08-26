"""App wiring: startup ticker union, the snapshot task, and static serving."""

import asyncio

import pytest
from fastapi.testclient import TestClient

from app.db import list_snapshots, remove_watchlist_ticker, upsert_position
from app.main import STATIC_DIR, create_app, snapshot_loop


def test_startup_starts_the_source_on_the_watchlist_position_union(fake_source):
    remove_watchlist_ticker("AAPL")
    upsert_position("AAPL", 5, 100.0)
    upsert_position("PYPL", 1, 60.0)

    with TestClient(create_app()):
        pass

    assert fake_source.started_with is not None
    started = set(fake_source.started_with)
    assert {"AAPL", "PYPL", "GOOGL", "MSFT"} <= started


def test_startup_initializes_the_database(fake_source, temp_db):
    with TestClient(create_app()) as client:
        assert client.get("/api/portfolio").json()["cash_balance"] == 10000.0


async def test_snapshot_loop_records_the_portfolio_value():
    task = asyncio.create_task(snapshot_loop(interval=0.01))
    await asyncio.sleep(0.05)
    task.cancel()

    snapshots = list_snapshots()
    assert snapshots
    assert snapshots[-1]["total_value"] == 10000.0


def test_static_export_is_not_mounted_when_absent(client):
    if STATIC_DIR.is_dir():
        pytest.skip("a frontend export is present")

    assert not any(getattr(route, "name", None) == "static" for route in client.app.routes)
