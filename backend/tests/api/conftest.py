"""A TestClient over the real app, with an isolated database and a fake source."""

import pytest
from fastapi.testclient import TestClient

from app.db import set_db_path
from app.main import create_app
from app.portfolio import runtime
from tests.portfolio.fake_source import FakeSource


@pytest.fixture(autouse=True)
def temp_db(tmp_path):
    """Fresh, uninitialized database file per test."""
    set_db_path(tmp_path / "db" / "artifinancial.db")


@pytest.fixture(autouse=True)
def cache():
    """Empty the shared price cache between tests."""
    for ticker in list(runtime.price_cache.get_all()):
        runtime.price_cache.remove(ticker)
    return runtime.price_cache


@pytest.fixture(autouse=True)
def fake_source(cache):
    """Swap the real market data source for a recording fake."""
    original = runtime.source
    runtime.source = FakeSource(cache)
    yield runtime.source
    runtime.source = original


@pytest.fixture
def client():
    """Client that does not run the lifespan, so no background tasks start."""
    return TestClient(create_app())
