"""Watchlist endpoints. Ticker tracking is kept in sync by app.portfolio.watchlist."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.portfolio import add_ticker, remove_ticker, watchlist_view

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class TickerRequest(BaseModel):
    """A ticker to add. Uppercased and format-validated server-side."""

    ticker: str


@router.get("")
async def get_watchlist() -> dict:
    """Watchlist tickers with their latest cached price, in the order added."""
    return {"watchlist": watchlist_view()}


@router.post("", status_code=201)
async def post_watchlist(request: TickerRequest) -> dict:
    """Add a ticker and start tracking its price."""
    return await add_ticker(request.ticker)


@router.delete("/{ticker}")
async def delete_watchlist(ticker: str) -> dict:
    """Remove a ticker, leaving it tracked if a position is still open."""
    return await remove_ticker(ticker)
