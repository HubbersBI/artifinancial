"""Compact portfolio context for the prompt.

Aggregates, not table dumps. The free tier's binding limit is tokens per minute,
so this stays a few hundred tokens even with a full watchlist. The numbers come
from the portfolio layer so chat and the REST API never disagree.
"""

from app.portfolio import build_portfolio, watchlist_view


def build_portfolio_context() -> str:
    """Render cash, positions with P&L, watchlist prices and totals as text."""
    portfolio = build_portfolio()
    positions = portfolio["positions"]
    lines = [
        f"CASH: ${portfolio['cash_balance']:,.2f}",
        f"POSITIONS VALUE: ${portfolio['positions_value']:,.2f}",
        f"TOTAL PORTFOLIO VALUE: ${portfolio['total_value']:,.2f}",
        f"UNREALIZED P&L: ${portfolio['unrealized_pnl']:+,.2f} "
        f"({portfolio['unrealized_pnl_percent']:+.2f}%)",
        "",
        f"POSITIONS ({len(positions)}):",
    ]
    lines.extend([_position_line(p) for p in positions] or ["  none"])
    lines.append("")
    lines.append(f"WATCHLIST: {_watchlist_line()}")
    return "\n".join(lines)


def _position_line(position: dict) -> str:
    """One position with its live price and unrealized P&L."""
    head = f"  {position['ticker']} {position['quantity']:g} @ avg ${position['avg_cost']:,.2f}"
    if position["current_price"] is None:
        return f"{head} | no price yet"
    return (
        f"{head} | last ${position['current_price']:,.2f}"
        f" | value ${position['market_value']:,.2f}"
        f" | P&L ${position['unrealized_pnl']:+,.2f}"
        f" ({position['unrealized_pnl_percent']:+.2f}%)"
    )


def _watchlist_line() -> str:
    """Watchlist tickers with their latest price, comma separated."""
    parts = [
        f"{row['ticker']} ${row['price']:,.2f}" if row["price"] is not None
        else f"{row['ticker']} (no price)"
        for row in watchlist_view()
    ]
    return ", ".join(parts) or "empty"
