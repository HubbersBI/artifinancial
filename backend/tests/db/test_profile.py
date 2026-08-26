"""Cash balance."""

from app.db import adjust_cash_balance, get_cash_balance, set_cash_balance


def test_seeded_balance():
    assert get_cash_balance() == 10000.0


def test_set_balance():
    set_cash_balance(1234.5)

    assert get_cash_balance() == 1234.5


def test_adjust_returns_the_new_balance():
    assert adjust_cash_balance(-2500.0) == 7500.0
    assert adjust_cash_balance(100.0) == 7600.0
    assert get_cash_balance() == 7600.0
