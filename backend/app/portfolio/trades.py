"""Market order execution - the single path for manual and LLM-initiated trades."""

from __future__ import annotations

from app.db import (
    adjust_cash_balance,
    append_snapshot,
    append_trade,
    apply_buy,
    apply_sell,
    get_cash_balance,
    get_position,
)

from .errors import TradeError
from .runtime import price_cache
from .valuation import MONEY, QTY, total_value

EPSILON = 1e-9


def _qty(value: float) -> str:
    """Format a share quantity for an error message without trailing zeros."""
    return f"{value:g}"


def execute_trade(ticker: str, side: str, quantity: float) -> dict:
    """Fill a market order at the ticker's latest cached price.

    Raises TradeError if the order violates any PLAN section 8 rule. Validation
    happens before any write, so a rejected trade leaves the database untouched.
    """
    ticker = ticker.strip().upper()
    side = side.strip().lower()

    if side not in ("buy", "sell"):
        raise TradeError("Side must be 'buy' or 'sell'")
    if quantity <= 0:
        raise TradeError("Quantity must be greater than 0")

    price = price_cache.get_price(ticker)
    if price is None:
        raise TradeError(f"No price available for {ticker} yet")

    if side == "buy":
        position = _buy(ticker, quantity, price)
    else:
        position = _sell(ticker, quantity, price)

    trade = append_trade(ticker, side, quantity, price)
    value = total_value()
    append_snapshot(value)
    return {
        "trade": trade,
        "position": position,
        "cash_balance": round(get_cash_balance(), MONEY),
        "total_value": value,
    }


def _buy(ticker: str, quantity: float, price: float) -> dict:
    """Check cash, then debit it and add the lot at a weighted average cost."""
    cost = quantity * price
    cash = get_cash_balance()
    if cost > cash + EPSILON:
        raise TradeError(
            f"Insufficient cash: need ${cost:.2f}, have ${cash:.2f} (short ${cost - cash:.2f})"
        )
    adjust_cash_balance(-cost)
    return _view(apply_buy(ticker, quantity, price))


def _sell(ticker: str, quantity: float, price: float) -> dict | None:
    """Check shares held, then reduce the position and credit the proceeds.

    Returns None when the sell closed the position.
    """
    position = get_position(ticker)
    held = position["quantity"] if position else 0.0
    if quantity > held + EPSILON:
        raise TradeError(
            f"Insufficient shares: cannot sell {_qty(quantity)} {ticker}, holding {_qty(held)}"
        )
    adjust_cash_balance(quantity * price)
    return _view(apply_sell(ticker, quantity))


def _view(position: dict | None) -> dict | None:
    """Trim a position row to the fields the API and the chat layer report."""
    if position is None:
        return None
    return {
        "ticker": position["ticker"],
        "quantity": round(position["quantity"], QTY),
        "avg_cost": round(position["avg_cost"], MONEY),
    }
