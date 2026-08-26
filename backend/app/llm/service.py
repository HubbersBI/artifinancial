"""The chat turn: context, history, model call, auto-execution, persistence."""

from collections.abc import Callable

from app.db import append_chat_message, list_chat_messages
from app.portfolio import TradeError, WatchlistError

from .client import complete
from .context import build_portfolio_context
from .mock import mock_enabled, mock_response
from .prompts import HISTORY_LIMIT, build_messages
from .schema import ChatResponse, Trade, WatchlistChange

ExecuteTrade = Callable[[str, str, float], dict]
ChangeWatchlist = Callable[[str, str], None]


class ChatService:
    """Runs one chat turn end to end.

    Trade execution and watchlist changes are injected rather than reimplemented,
    so LLM-initiated actions get exactly the same validation as manual ones
    (PLAN section 8).
    """

    def __init__(self, execute_trade: ExecuteTrade, change_watchlist: ChangeWatchlist) -> None:
        self.execute_trade = execute_trade
        self.change_watchlist = change_watchlist

    def handle(self, user_message: str) -> dict:
        """Answer one user message, executing any actions the model returns."""
        reply = self._generate(user_message)
        append_chat_message("user", user_message)

        actions = {
            "trades": [self._run_trade(trade) for trade in reply.trades],
            "watchlist_changes": [self._run_change(c) for c in reply.watchlist_changes],
        }
        stored = append_chat_message("assistant", reply.message, actions=actions)
        return {"message": reply.message, **actions, "created_at": stored["created_at"]}

    def _generate(self, user_message: str) -> ChatResponse:
        """Mock response, or a real model call with portfolio context and capped history."""
        if mock_enabled():
            return mock_response(user_message)
        history = list_chat_messages(limit=HISTORY_LIMIT)
        return complete(build_messages(build_portfolio_context(), history, user_message))

    def _run_trade(self, trade: Trade) -> dict:
        """Execute one trade, capturing a validation rejection as an error field."""
        result = {"ticker": trade.ticker.upper(), "side": trade.side, "quantity": trade.quantity}
        try:
            fill = self.execute_trade(trade.ticker, trade.side, trade.quantity)
        except TradeError as exc:
            return {**result, "price": None, "status": "rejected", "error": str(exc)}
        return {
            **result,
            "price": fill["trade"]["price"],
            "status": "executed",
            "error": None,
        }

    def _run_change(self, change: WatchlistChange) -> dict:
        """Apply one watchlist change, capturing a rejection as an error field."""
        result = {"ticker": change.ticker.upper(), "action": change.action}
        try:
            self.change_watchlist(change.ticker, change.action)
        except WatchlistError as exc:
            return {**result, "status": "rejected", "error": str(exc)}
        return {**result, "status": "executed", "error": None}
