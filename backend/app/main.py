"""FastAPI application: REST routes, SSE streaming, and the static frontend."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import chat as chat_routes
from app.api import portfolio as portfolio_routes
from app.api import system as system_routes
from app.api import watchlist as watchlist_routes
from app.db import append_snapshot, init_db
from app.market import create_stream_router
from app.portfolio import (
    TradeError,
    WatchlistError,
    runtime,
    total_value,
    tracked_tickers,
)

logger = logging.getLogger(__name__)

SNAPSHOT_INTERVAL = 30.0
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


async def snapshot_loop(interval: float = SNAPSHOT_INTERVAL) -> None:
    """Record the portfolio's total value every `interval` seconds (PLAN section 7)."""
    while True:
        await asyncio.sleep(interval)
        append_snapshot(total_value())


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize the database, start market data, and run the snapshot task.

    The source starts on the Tracked Ticker Set: the watchlist union every ticker
    with an open position (PLAN section 8).
    """
    init_db()
    await runtime.source.start(tracked_tickers())
    task = asyncio.create_task(snapshot_loop())
    yield
    task.cancel()
    await runtime.source.stop()


def create_app() -> FastAPI:
    """Build the application with all routers mounted."""
    app = FastAPI(title="Artifinancial", version="0.1.0", lifespan=lifespan)

    app.add_exception_handler(TradeError, _trade_error_handler)
    app.add_exception_handler(WatchlistError, _watchlist_error_handler)

    app.include_router(system_routes.router)
    app.include_router(portfolio_routes.router)
    app.include_router(watchlist_routes.router)
    app.include_router(create_stream_router(runtime.price_cache))
    app.include_router(chat_routes.router)
    _mount_static(app)
    return app


async def _trade_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """A rejected market order is a 400 carrying the user-facing message."""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


async def _watchlist_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """A rejected watchlist change carries its own status: 400, 404, or 409."""
    return JSONResponse(status_code=exc.status, content={"detail": str(exc)})


def _mount_static(app: FastAPI) -> None:
    """Serve the Next.js static export from / as a catch-all after the API routes."""
    if not STATIC_DIR.is_dir():
        logger.warning("No static export at %s - serving API only", STATIC_DIR)
        return
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")


app = create_app()
