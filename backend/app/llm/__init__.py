"""LLM chat assistant for Artifinancial.

Public API:
    ChatService     - runs one chat turn end to end
    ChatResponse    - strict structured output schema
    mock_enabled    - whether LLM_MOCK is on
"""

from .mock import mock_enabled
from .schema import ChatResponse, Trade, WatchlistChange
from .service import ChatService

__all__ = ["ChatService", "ChatResponse", "Trade", "WatchlistChange", "mock_enabled"]
