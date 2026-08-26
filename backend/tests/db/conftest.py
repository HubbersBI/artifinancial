"""Point the data layer at a throwaway database for every test."""

import pytest

from app.db import set_db_path


@pytest.fixture(autouse=True)
def temp_db(tmp_path):
    """Fresh, uninitialized database file per test."""
    path = tmp_path / "db" / "artifinancial.db"
    set_db_path(path)
    yield path
