"""Mock mode: the trigger phrases documented in planning/CONTRACTS.md."""

import pytest

from app.llm.mock import mock_enabled, mock_response


@pytest.mark.parametrize("value", ["true", "TRUE", "1", "yes"])
def test_mock_enabled_for_truthy_values(monkeypatch, value):
    monkeypatch.setenv("LLM_MOCK", value)
    assert mock_enabled()


@pytest.mark.parametrize("value", ["false", "0", "", "no"])
def test_mock_disabled_otherwise(monkeypatch, value):
    monkeypatch.setenv("LLM_MOCK", value)
    assert not mock_enabled()


def test_mock_disabled_when_unset(monkeypatch):
    monkeypatch.delenv("LLM_MOCK", raising=False)
    assert not mock_enabled()


def test_plain_reply_returns_empty_action_arrays():
    reply = mock_response("What is my portfolio worth?")
    assert reply.message
    assert reply.trades == []
    assert reply.watchlist_changes == []


def test_buy_trigger():
    reply = mock_response("buy 5 AAPL")
    assert reply.watchlist_changes == []
    assert (reply.trades[0].side, reply.trades[0].ticker, reply.trades[0].quantity) == (
        "buy",
        "AAPL",
        5.0,
    )


def test_sell_trigger_takes_precedence_over_buy():
    reply = mock_response("sell 2 NVDA that I would buy back later")
    assert reply.trades[0].side == "sell"
    assert reply.trades[0].ticker == "NVDA"
    assert reply.trades[0].quantity == 2.0


def test_watchlist_add_trigger():
    reply = mock_response("add PYPL to my watchlist")
    assert reply.trades == []
    assert (reply.watchlist_changes[0].action, reply.watchlist_changes[0].ticker) == ("add", "PYPL")


def test_watchlist_remove_trigger():
    reply = mock_response("remove TSLA from the watchlist")
    assert (reply.watchlist_changes[0].action, reply.watchlist_changes[0].ticker) == (
        "remove",
        "TSLA",
    )


def test_defaults_when_no_ticker_or_quantity_given():
    trade = mock_response("buy something").trades[0]
    assert (trade.ticker, trade.quantity) == ("AAPL", 1.0)
    assert mock_response("add to the watchlist").watchlist_changes[0].ticker == "PYPL"


def test_is_deterministic():
    assert mock_response("buy 5 AAPL") == mock_response("buy 5 AAPL")
