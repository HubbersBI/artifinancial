"""Compact portfolio context rendering."""

from app.db import add_watchlist_ticker, apply_buy, set_cash_balance
from app.llm.context import build_portfolio_context


def test_empty_portfolio_reads_cleanly():
    context = build_portfolio_context()
    assert "POSITIONS (0):" in context
    assert "  none" in context
    assert "$10,000.00" in context


def test_position_shows_live_price_and_pnl():
    set_cash_balance(1000.0)
    apply_buy("AAPL", 10, 180.0)

    context = build_portfolio_context()

    assert "AAPL 10 @ avg $180.00 | last $190.50" in context
    assert "P&L $+105.00 (+5.83%)" in context
    assert "POSITIONS VALUE: $1,905.00" in context
    assert "TOTAL PORTFOLIO VALUE: $2,905.00" in context


def test_position_without_a_price_is_flagged_and_marked_at_cost():
    apply_buy("PYPL", 4, 60.0)
    context = build_portfolio_context()
    assert "PYPL 4 @ avg $60.00 | no price yet" in context
    assert "POSITIONS VALUE: $240.00" in context
    assert "UNREALIZED P&L: $+0.00" in context


def test_watchlist_line_marks_tickers_with_no_price():
    """The ten seeded tickers plus one added; only AAPL has a cached price."""
    add_watchlist_ticker("PYPL")
    context = build_portfolio_context()
    assert "WATCHLIST: AAPL $190.50, GOOGL (no price)" in context
    assert "PYPL (no price)" in context
