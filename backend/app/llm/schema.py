"""Structured output schema for the chat assistant.

Strict mode on Groq guarantees compliance only when every field is required and
every object forbids extra keys. No field carries a default: a default drops the
field from the schema's ``required`` list and breaks that guarantee. The model is
told in the system prompt to return ``[]`` rather than omit the action arrays.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class Trade(BaseModel):
    """A single market order for the backend to execute."""

    model_config = ConfigDict(extra="forbid")

    ticker: str
    side: Literal["buy", "sell"]
    quantity: float


class WatchlistChange(BaseModel):
    """An addition to or removal from the watchlist."""

    model_config = ConfigDict(extra="forbid")

    ticker: str
    action: Literal["add", "remove"]


class ChatResponse(BaseModel):
    """Structured reply from the trading assistant."""

    model_config = ConfigDict(extra="forbid")

    message: str
    trades: list[Trade]
    watchlist_changes: list[WatchlistChange]
