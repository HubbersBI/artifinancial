"""The one-connection-per-operation strategy under concurrent threads."""

from concurrent.futures import ThreadPoolExecutor

from app.db import append_trade, get_cash_balance, init_db, list_trades


def test_parallel_writes_all_land():
    init_db()

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda i: append_trade("AAPL", "buy", 1, 100.0 + i), range(16)))

    assert len(list_trades(limit=100)) == 16


def test_parallel_reads_during_writes():
    init_db()

    with ThreadPoolExecutor(max_workers=8) as pool:
        writes = pool.map(lambda i: append_trade("AAPL", "buy", 1, 100.0 + i), range(8))
        reads = pool.map(lambda _: get_cash_balance(), range(8))
        list(writes)
        assert all(balance == 10000.0 for balance in reads)
