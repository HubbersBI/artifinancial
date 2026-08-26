"""Portfolio snapshots."""

from app.db import append_snapshot, list_snapshots


def test_append_returns_the_stored_snapshot():
    snapshot = append_snapshot(10500.25)

    assert snapshot["total_value"] == 10500.25
    assert snapshot["user_id"] == "default"


def test_history_is_oldest_first():
    for value in (10000.0, 10100.0, 10200.0):
        append_snapshot(value)

    assert [s["total_value"] for s in list_snapshots()] == [10000.0, 10100.0, 10200.0]


def test_limit_keeps_the_most_recent_still_in_order():
    for value in (1.0, 2.0, 3.0, 4.0):
        append_snapshot(value)

    assert [s["total_value"] for s in list_snapshots(limit=2)] == [3.0, 4.0]


def test_no_snapshots_yet():
    assert list_snapshots() == []
