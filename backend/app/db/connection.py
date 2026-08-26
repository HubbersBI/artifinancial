"""SQLite connection handling and lazy initialization.

One connection per operation, opened and closed inside a context manager. That is
safe under FastAPI's threadpool without any thread-local plumbing.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

DEFAULT_USER_ID = "default"

_RELATIVE_PATH = Path("db") / "artifinancial.db"

_lock = threading.Lock()
_initialized = False
_override_path: Path | None = None


def db_path() -> Path:
    """Resolved path of the SQLite file.

    ARTIFINANCIAL_DB_PATH wins if set; otherwise db/artifinancial.db relative to
    the working directory, which is /app/db in the container.
    """
    if _override_path is not None:
        return _override_path
    env_path = os.getenv("ARTIFINANCIAL_DB_PATH")
    return Path(env_path) if env_path else _RELATIVE_PATH.resolve()


def set_db_path(path: Path | str) -> None:
    """Point the data layer at a different file and force re-initialization."""
    global _override_path, _initialized
    with _lock:
        _override_path = Path(path)
        _initialized = False


def open_connection() -> sqlite3.Connection:
    """Open a connection without triggering initialization."""
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def ensure_initialized() -> None:
    """Create and seed the database once per process, on first use."""
    global _initialized
    if _initialized:
        return
    with _lock:
        if _initialized:
            return
        from .schema import create_and_seed

        create_and_seed()
        _initialized = True


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """Yield a connection inside a transaction, committing on clean exit."""
    ensure_initialized()
    conn = open_connection()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row) -> dict:
    """Plain dict from a sqlite3.Row."""
    return dict(row)


def mark_initialized() -> None:
    """Record that the database is ready, so later calls skip the check."""
    global _initialized
    _initialized = True
