"""Deterministic mock responses for LLM_MOCK=true.

No network, no API key. Triggers are documented in planning/CONTRACTS.md under
"Chat response shape and mock triggers" and the E2E suite steers on them.
"""

import os
import re

from .schema import ChatResponse, Trade, WatchlistChange

TICKER_RE = re.compile(r"\b[A-Z]{1,5}\b")
NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


def mock_enabled() -> bool:
    """True when LLM_MOCK is set to a truthy value."""
    return os.getenv("LLM_MOCK", "").strip().lower() in {"1", "true", "yes"}


def mock_response(user_message: str) -> ChatResponse:
    """Map the user's message to a fixed response by first matching trigger."""
    lowered = user_message.lower()
    ticker = _ticker(user_message)
    quantity = _quantity(user_message)

    if "sell" in lowered:
        return _trade_response("sell", ticker or "AAPL", quantity)
    if "buy" in lowered:
        return _trade_response("buy", ticker or "AAPL", quantity)
    if "remove" in lowered:
        return _watchlist_response("remove", ticker or "PYPL")
    if "watch" in lowered or "add" in lowered:
        return _watchlist_response("add", ticker or "PYPL")
    return ChatResponse(
        message="Mock assistant: your portfolio is shown in the panels on the left.",
        trades=[],
        watchlist_changes=[],
    )


def _trade_response(side: str, ticker: str, quantity: float) -> ChatResponse:
    verb = "Bought" if side == "buy" else "Sold"
    return ChatResponse(
        message=f"Mock assistant: {verb} {quantity:g} {ticker}.",
        trades=[Trade(ticker=ticker, side=side, quantity=quantity)],
        watchlist_changes=[],
    )


def _watchlist_response(action: str, ticker: str) -> ChatResponse:
    phrase = f"Added {ticker} to" if action == "add" else f"Removed {ticker} from"
    return ChatResponse(
        message=f"Mock assistant: {phrase} the watchlist.",
        trades=[],
        watchlist_changes=[WatchlistChange(ticker=ticker, action=action)],
    )


def _ticker(message: str) -> str | None:
    """First uppercase 1-5 letter token in the message."""
    match = TICKER_RE.search(message)
    return match.group(0) if match else None


def _quantity(message: str) -> float:
    """First number in the message, defaulting to 1."""
    match = NUMBER_RE.search(message)
    return float(match.group(0)) if match else 1.0
