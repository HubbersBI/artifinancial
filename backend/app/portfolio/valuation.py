"""Portfolio valuation against the live price cache."""

from __future__ import annotations

from app.db import get_cash_balance, list_positions, list_watchlist

from .runtime import price_cache

MONEY = 2
QTY = 6


def _value_position(row: dict) -> dict:
    """Value one position row, falling back to avg_cost when no price is cached.

    A ticker with no tick yet reports `current_price: null` and zero P&L rather
    than valuing the holding at zero.
    """
    quantity = row["quantity"]
    avg_cost = row["avg_cost"]
    price = price_cache.get_price(row["ticker"])
    mark = price if price is not None else avg_cost
    cost_basis = quantity * avg_cost
    market_value = quantity * mark
    pnl = market_value - cost_basis
    return {
        "ticker": row["ticker"],
        "quantity": round(quantity, QTY),
        "avg_cost": round(avg_cost, MONEY),
        "current_price": round(price, MONEY) if price is not None else None,
        "market_value": round(market_value, MONEY),
        "cost_basis": round(cost_basis, MONEY),
        "unrealized_pnl": round(pnl, MONEY),
        "unrealized_pnl_percent": round(pnl / cost_basis * 100, MONEY) if cost_basis else 0.0,
    }


def build_portfolio() -> dict:
    """Cash, valued positions, and portfolio totals - the GET /api/portfolio body."""
    positions = [_value_position(row) for row in list_positions()]
    cash = get_cash_balance()
    positions_value = sum(p["market_value"] for p in positions)
    cost_basis = sum(p["cost_basis"] for p in positions)
    pnl = positions_value - cost_basis
    return {
        "cash_balance": round(cash, MONEY),
        "positions": positions,
        "positions_value": round(positions_value, MONEY),
        "total_value": round(cash + positions_value, MONEY),
        "unrealized_pnl": round(pnl, MONEY),
        "unrealized_pnl_percent": round(pnl / cost_basis * 100, MONEY) if cost_basis else 0.0,
    }


def total_value() -> float:
    """Cash plus the marked value of every position."""
    return build_portfolio()["total_value"]


def watchlist_view() -> list[dict]:
    """Watchlist tickers with their latest cached price, in the order added.

    Price fields are all None together until the first tick arrives.
    """
    held = {row["ticker"]: row["quantity"] for row in list_positions()}
    rows = []
    for ticker in list_watchlist():
        update = price_cache.get(ticker)
        prices = (
            {
                "price": round(update.price, MONEY),
                "previous_price": round(update.previous_price, MONEY),
                "change": update.change,
                "change_percent": update.change_percent,
                "direction": update.direction,
                "timestamp": update.timestamp,
            }
            if update
            else {
                "price": None,
                "previous_price": None,
                "change": None,
                "change_percent": None,
                "direction": None,
                "timestamp": None,
            }
        )
        rows.append({"ticker": ticker, **prices, "position_quantity": held.get(ticker, 0.0)})
    return rows


def tracked_tickers() -> list[str]:
    """The Tracked Ticker Set: the watchlist union every ticker with an open position.

    A held ticker must stay tracked after leaving the watchlist, or its position
    loses its price and can never be sold (PLAN section 8).
    """
    watchlist = set(list_watchlist())
    positions = {row["ticker"] for row in list_positions()}
    return sorted(watchlist | positions)
