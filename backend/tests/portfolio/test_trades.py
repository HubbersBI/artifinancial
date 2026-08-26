"""Trade execution rules from PLAN section 8."""

import pytest

from app.db import get_cash_balance, get_position, list_snapshots, list_trades
from app.portfolio import TradeError, execute_trade


@pytest.fixture
def priced(cache):
    """AAPL quoted at 100.00."""
    cache.update("AAPL", 100.0)
    return cache


def test_buy_fills_at_cached_price(priced):
    result = execute_trade("AAPL", "buy", 10)

    assert result["trade"]["price"] == 100.0
    assert result["trade"]["side"] == "buy"
    assert result["position"] == {"ticker": "AAPL", "quantity": 10.0, "avg_cost": 100.0}
    assert result["cash_balance"] == 9000.0
    assert result["total_value"] == 10000.0


def test_buy_lowercase_ticker_and_side_are_normalized(priced):
    result = execute_trade("aapl", "BUY", 1)

    assert result["trade"]["ticker"] == "AAPL"
    assert result["trade"]["side"] == "buy"


def test_fill_appends_a_trade_and_a_snapshot(priced):
    execute_trade("AAPL", "buy", 2)

    assert len(list_trades()) == 1
    assert len(list_snapshots()) == 1
    assert list_snapshots()[-1]["total_value"] == 10000.0


def test_fractional_quantity_is_allowed(priced):
    result = execute_trade("AAPL", "buy", 0.5)

    assert result["position"]["quantity"] == 0.5
    assert result["cash_balance"] == 9950.0


def test_repeat_buys_weight_the_average_cost(cache):
    cache.update("AAPL", 100.0)
    execute_trade("AAPL", "buy", 10)
    cache.update("AAPL", 200.0)
    result = execute_trade("AAPL", "buy", 30)

    assert result["position"]["quantity"] == 40.0
    assert result["position"]["avg_cost"] == 175.0


def test_sell_leaves_avg_cost_alone(cache):
    cache.update("AAPL", 100.0)
    execute_trade("AAPL", "buy", 10)
    cache.update("AAPL", 250.0)
    result = execute_trade("AAPL", "sell", 4)

    assert result["position"]["quantity"] == 6.0
    assert result["position"]["avg_cost"] == 100.0
    assert result["cash_balance"] == 10000.0


def test_position_is_deleted_at_zero_quantity(priced):
    execute_trade("AAPL", "buy", 10)
    result = execute_trade("AAPL", "sell", 10)

    assert result["position"] is None
    assert get_position("AAPL") is None
    assert get_cash_balance() == 10000.0


def test_selling_at_a_loss_credits_the_lower_price(cache):
    cache.update("AAPL", 100.0)
    execute_trade("AAPL", "buy", 10)
    cache.update("AAPL", 60.0)
    execute_trade("AAPL", "sell", 10)

    assert get_cash_balance() == 9600.0


def test_no_cached_price_is_rejected(cache):
    with pytest.raises(TradeError, match="No price available for PYPL yet"):
        execute_trade("PYPL", "buy", 1)


@pytest.mark.parametrize("quantity", [0, -1, -0.5])
def test_non_positive_quantity_is_rejected(priced, quantity):
    with pytest.raises(TradeError, match="Quantity must be greater than 0"):
        execute_trade("AAPL", "buy", quantity)


def test_bad_side_is_rejected(priced):
    with pytest.raises(TradeError, match="Side must be 'buy' or 'sell'"):
        execute_trade("AAPL", "short", 1)


def test_insufficient_cash_reports_the_shortfall(priced):
    with pytest.raises(TradeError) as exc:
        execute_trade("AAPL", "buy", 150)

    assert str(exc.value) == (
        "Insufficient cash: need $15000.00, have $10000.00 (short $5000.00)"
    )


def test_buy_spending_the_entire_balance_is_allowed(priced):
    result = execute_trade("AAPL", "buy", 100)

    assert result["cash_balance"] == 0.0


def test_selling_more_than_held_is_rejected(priced):
    execute_trade("AAPL", "buy", 4)

    with pytest.raises(TradeError, match="cannot sell 10 AAPL, holding 4"):
        execute_trade("AAPL", "sell", 10)


def test_selling_with_no_position_is_rejected_no_shorting(priced):
    with pytest.raises(TradeError, match="cannot sell 10 AAPL, holding 0"):
        execute_trade("AAPL", "sell", 10)


def test_a_rejected_trade_writes_nothing(priced):
    with pytest.raises(TradeError):
        execute_trade("AAPL", "buy", 150)

    assert list_trades() == []
    assert list_snapshots() == []
    assert get_cash_balance() == 10000.0
