"""Portfolio, trade execution, and trade history endpoints (PLAN section 8)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.db import list_snapshots, list_trades
from app.portfolio import build_portfolio, execute_trade

router = APIRouter(prefix="/api", tags=["portfolio"])


class TradeRequest(BaseModel):
    """A market order. Fractional quantities are allowed."""

    ticker: str
    quantity: float
    side: Literal["buy", "sell"]


@router.get("/portfolio")
async def get_portfolio() -> dict:
    """Cash, positions valued against the live price cache, and totals."""
    return build_portfolio()


@router.post("/portfolio/trade")
async def post_trade(request: TradeRequest) -> dict:
    """Fill a market order at the ticker's latest cached price.

    Rejections come back as 400 via the TradeError handler in main.
    """
    return execute_trade(request.ticker, request.side, request.quantity)


@router.get("/portfolio/history")
async def get_history(limit: int = Query(500, ge=1, le=2000)) -> dict:
    """Portfolio value snapshots for the P&L chart, oldest first."""
    rows = list_snapshots(limit=limit)
    return {
        "snapshots": [
            {"total_value": row["total_value"], "recorded_at": row["recorded_at"]} for row in rows
        ]
    }


@router.get("/trades")
async def get_trades(
    limit: int = Query(50, ge=1, le=500),
    ticker: str | None = Query(None, max_length=10),
) -> dict:
    """Trade history, newest first, optionally filtered to one ticker."""
    filter_ticker = ticker.strip().upper() if ticker else None
    return {"trades": list_trades(limit=limit, ticker=filter_ticker)}
