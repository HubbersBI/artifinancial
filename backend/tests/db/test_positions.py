"""Position rules: weighted avg_cost on buys, deletion at zero quantity."""

from app.db import (
    apply_buy,
    apply_sell,
    delete_position,
    get_position,
    list_positions,
    upsert_position,
)


def test_first_buy_creates_the_position():
    position = apply_buy("AAPL", 10, 190.0)

    assert position["quantity"] == 10
    assert position["avg_cost"] == 190.0
    assert position["ticker"] == "AAPL"


def test_repeat_buy_uses_a_weighted_average_cost():
    apply_buy("AAPL", 10, 100.0)
    position = apply_buy("AAPL", 30, 200.0)

    assert position["quantity"] == 40
    assert position["avg_cost"] == 175.0  # (10*100 + 30*200) / 40


def test_three_buys_stay_weighted():
    apply_buy("AAPL", 1, 100.0)
    apply_buy("AAPL", 1, 200.0)
    position = apply_buy("AAPL", 2, 300.0)

    assert position["avg_cost"] == 225.0  # (100 + 200 + 600) / 4


def test_fractional_quantities_are_supported():
    position = apply_buy("AAPL", 0.5, 190.0)

    assert position["quantity"] == 0.5


def test_sell_leaves_avg_cost_unchanged():
    apply_buy("AAPL", 10, 100.0)
    position = apply_sell("AAPL", 4)

    assert position["quantity"] == 6
    assert position["avg_cost"] == 100.0


def test_selling_everything_deletes_the_position():
    apply_buy("AAPL", 10, 100.0)

    assert apply_sell("AAPL", 10) is None
    assert get_position("AAPL") is None
    assert list_positions() == []


def test_no_zero_row_is_left_behind_after_fractional_sells():
    apply_buy("AAPL", 0.3, 100.0)
    apply_sell("AAPL", 0.1)
    apply_sell("AAPL", 0.2)

    assert get_position("AAPL") is None


def test_upsert_with_zero_quantity_deletes():
    apply_buy("AAPL", 10, 100.0)

    assert upsert_position("AAPL", 0, 100.0) is None
    assert get_position("AAPL") is None


def test_selling_an_unheld_ticker_is_a_no_op():
    assert apply_sell("TSLA", 5) is None


def test_delete_reports_whether_a_row_went():
    apply_buy("AAPL", 1, 100.0)

    assert delete_position("AAPL") is True
    assert delete_position("AAPL") is False


def test_positions_are_listed_by_ticker():
    apply_buy("TSLA", 1, 250.0)
    apply_buy("AAPL", 1, 190.0)

    assert [p["ticker"] for p in list_positions()] == ["AAPL", "TSLA"]


def test_upsert_keeps_one_row_per_ticker():
    apply_buy("AAPL", 1, 100.0)
    apply_buy("AAPL", 1, 100.0)

    assert len(list_positions()) == 1
