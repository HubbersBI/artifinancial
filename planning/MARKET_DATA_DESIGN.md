# Market Data Backend — Design

Implementation-ready reference for the Artifinancial market data subsystem: the unified interface, the thread-safe price cache, the GBM simulator, the Massive (Polygon.io) REST client, the SSE streaming endpoint, and how the rest of the backend (trade execution, watchlist, portfolio valuation) is meant to integrate with it per `PLAN.md` §6–§8.

**Status:** The subsystem described here is built and tested — see `planning/MARKET_DATA_SUMMARY.md` for the test/coverage report. Every code sample below is the actual source in `backend/app/market/`, not a sketch. Sections 11–12 (FastAPI lifecycle wiring and watchlist coordination) describe integration points that the rest of the backend (not yet built) is expected to implement against this subsystem.

All code lives under `backend/app/market/`.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [File Structure](#2-file-structure)
3. [Data Model — `models.py`](#3-data-model--modelspy)
4. [Price Cache — `cache.py`](#4-price-cache--cachepy)
5. [Abstract Interface — `interface.py`](#5-abstract-interface--interfacepy)
6. [Seed Prices & Ticker Parameters — `seed_prices.py`](#6-seed-prices--ticker-parameters--seed_pricespy)
7. [GBM Simulator — `simulator.py`](#7-gbm-simulator--simulatorpy)
8. [Massive API Client — `massive_client.py`](#8-massive-api-client--massive_clientpy)
9. [Factory — `factory.py`](#9-factory--factorypy)
10. [SSE Streaming Endpoint — `stream.py`](#10-sse-streaming-endpoint--streampy)
11. [FastAPI Lifecycle Integration](#11-fastapi-lifecycle-integration)
12. [Watchlist Coordination — the Tracked Ticker Set](#12-watchlist-coordination--the-tracked-ticker-set)
13. [Testing Strategy](#13-testing-strategy)
14. [Error Handling & Edge Cases](#14-error-handling--edge-cases)
15. [Configuration Summary](#15-configuration-summary)
16. [Terminal Demo](#16-terminal-demo)

---

## 1. Architecture

```
MarketDataSource (ABC)
├── SimulatorDataSource  →  GBM simulator (default, no API key needed)
└── MassiveDataSource    →  Polygon.io REST poller (when MASSIVE_API_KEY set)
        │
        ▼
   PriceCache (thread-safe, in-memory, single instance)
        │
        ├──→ SSE stream endpoint (GET /api/stream/prices)
        ├──→ Portfolio valuation (reads latest price per position)
        └──→ Trade execution (reads latest price to fill an order)
```

**Strategy pattern.** Both data sources implement the same `MarketDataSource` ABC. Neither the SSE endpoint nor the trade/portfolio code needs to know which one is active — they only ever touch the `PriceCache`.

**Push, not pull.** A data source doesn't return prices — it writes them into the shared `PriceCache` on its own schedule (every 500ms for the simulator, every 15s for Massive's free tier). Readers (SSE, trade execution) always read the latest cached value regardless of how the source produces it. This is what lets the simulator and Massive share one SSE loop with one polling cadence, even though their underlying update cadences are wildly different (§6 of `PLAN.md`).

**One cache, many readers.** `PriceCache` holds only the *latest* and *previous* tick per ticker — no history. That's a deliberate simplification (`PLAN.md` §6, "No Price History"): sparklines and the main chart are built client-side from the SSE stream since page load, and the only server-persisted price series is `portfolio_snapshots`, which lives in the database layer, not here.

---

## 2. File Structure

```
backend/
  app/
    market/
      __init__.py             # Re-exports: PriceUpdate, PriceCache, MarketDataSource,
                               #   create_market_data_source, create_stream_router
      models.py                # PriceUpdate dataclass
      cache.py                 # PriceCache (thread-safe in-memory store)
      interface.py              # MarketDataSource ABC
      seed_prices.py            # SEED_PRICES, TICKER_PARAMS, DEFAULT_PARAMS, CORRELATION_GROUPS
      simulator.py               # GBMSimulator + SimulatorDataSource
      massive_client.py          # MassiveDataSource
      factory.py                  # create_market_data_source()
      stream.py                   # SSE endpoint (FastAPI router factory)
  market_data_demo.py          # Rich terminal demo (uv run market_data_demo.py)
  tests/
    market/
      test_models.py
      test_cache.py
      test_simulator.py
      test_simulator_source.py
      test_factory.py
      test_massive.py
```

Each module has a single responsibility. `app/market/__init__.py` re-exports the public API so the rest of the backend imports from `app.market` without reaching into submodules:

```python
from app.market import PriceCache, PriceUpdate, MarketDataSource, create_market_data_source
```

---

## 3. Data Model — `models.py`

`PriceUpdate` is the only data structure that leaves the market data layer. Every downstream consumer — SSE streaming, portfolio valuation, trade execution — works exclusively with this type.

```python
"""Data models for market data."""

from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class PriceUpdate:
    """Immutable snapshot of a single ticker's price at a point in time."""

    ticker: str
    price: float
    previous_price: float
    timestamp: float = field(default_factory=time.time)  # Unix seconds

    @property
    def change(self) -> float:
        """Absolute price change from previous update."""
        return round(self.price - self.previous_price, 4)

    @property
    def change_percent(self) -> float:
        """Percentage change from previous update."""
        if self.previous_price == 0:
            return 0.0
        return round((self.price - self.previous_price) / self.previous_price * 100, 4)

    @property
    def direction(self) -> str:
        """'up', 'down', or 'flat'."""
        if self.price > self.previous_price:
            return "up"
        elif self.price < self.previous_price:
            return "down"
        return "flat"

    def to_dict(self) -> dict:
        """Serialize for JSON / SSE transmission."""
        return {
            "ticker": self.ticker,
            "price": self.price,
            "previous_price": self.previous_price,
            "timestamp": self.timestamp,
            "change": self.change,
            "change_percent": self.change_percent,
            "direction": self.direction,
        }
```

**Design decisions**

- `frozen=True` — price updates are immutable value objects, safe to hand to async tasks or SSE generators without copying.
- `slots=True` — memory optimization; many of these are created per second across all tickers.
- `change`, `change_percent`, `direction` are **computed properties**, not stored fields, so they can never drift out of sync with `price`/`previous_price`.
- `to_dict()` is the single serialization point, shared by the SSE endpoint (§10) and, later, any REST response that embeds a price.
- `to_dict()`'s keys and shapes match the SSE wire format specified in `PLAN.md` §6 exactly — `ticker`, `price`, `previous_price`, `timestamp`, `change`, `change_percent`, `direction`.

---

## 4. Price Cache — `cache.py`

The price cache is the central data hub: exactly one `PriceCache` instance exists per running app (constructed once at startup). Data sources write to it; the SSE endpoint and (eventually) trade/portfolio code read from it. It must be thread-safe because the Massive client's synchronous REST calls run via `asyncio.to_thread()`, which executes in a real OS thread outside the event loop.

```python
"""Thread-safe in-memory price cache."""

from __future__ import annotations

import time
from threading import Lock

from .models import PriceUpdate


class PriceCache:
    """Thread-safe in-memory cache of the latest price for each ticker.

    Writers: SimulatorDataSource or MassiveDataSource (one at a time).
    Readers: SSE streaming endpoint, portfolio valuation, trade execution.
    """

    def __init__(self) -> None:
        self._prices: dict[str, PriceUpdate] = {}
        self._lock = Lock()
        self._version: int = 0  # Monotonically increasing; bumped on every update

    def update(self, ticker: str, price: float, timestamp: float | None = None) -> PriceUpdate:
        """Record a new price for a ticker. Returns the created PriceUpdate.

        Automatically computes direction and change from the previous price.
        If this is the first update for the ticker, previous_price == price (direction='flat').
        """
        with self._lock:
            ts = timestamp or time.time()
            prev = self._prices.get(ticker)
            previous_price = prev.price if prev else price

            update = PriceUpdate(
                ticker=ticker,
                price=round(price, 2),
                previous_price=round(previous_price, 2),
                timestamp=ts,
            )
            self._prices[ticker] = update
            self._version += 1
            return update

    def get(self, ticker: str) -> PriceUpdate | None:
        """Get the latest price for a single ticker, or None if unknown."""
        with self._lock:
            return self._prices.get(ticker)

    def get_all(self) -> dict[str, PriceUpdate]:
        """Snapshot of all current prices. Returns a shallow copy."""
        with self._lock:
            return dict(self._prices)

    def get_price(self, ticker: str) -> float | None:
        """Convenience: get just the price float, or None."""
        update = self.get(ticker)
        return update.price if update else None

    def remove(self, ticker: str) -> None:
        """Remove a ticker from the cache (e.g., when removed from watchlist)."""
        with self._lock:
            self._prices.pop(ticker, None)

    @property
    def version(self) -> int:
        """Current version counter. Useful for SSE change detection."""
        return self._version

    def __len__(self) -> int:
        with self._lock:
            return len(self._prices)

    def __contains__(self, ticker: str) -> bool:
        with self._lock:
            return ticker in self._prices
```

### Why a version counter

The SSE loop (§10) polls the cache every ~500ms regardless of the active source. Without a version counter it would re-serialize and push every ticker on every tick even when nothing changed — wasteful when Massive's free tier only updates once per 15s. Instead:

```python
last_version = -1
while True:
    if price_cache.version != last_version:
        last_version = price_cache.version
        yield format_sse(price_cache.get_all())
    await asyncio.sleep(0.5)
```

This gives `PLAN.md` §6's requirement directly: *"An event is sent only when the price cache has changed since the last send."*

### Thread-safety rationale

`threading.Lock`, not `asyncio.Lock`, because:

- The Massive client's synchronous `get_snapshot_all()` runs inside `asyncio.to_thread()` — a real OS thread. `asyncio.Lock` provides no protection there.
- `threading.Lock` works correctly whether the caller is a sync thread or the async event loop, so one cache implementation serves both data sources unmodified.

### Trading against the cache

Trade execution (built in the portfolio module, not here) is expected to read via `get_price()`:

```python
price = price_cache.get_price(ticker)
if price is None:
    raise HTTPException(400, f"No price available for {ticker} yet")
```

This is the mechanism behind `PLAN.md` §8's "No cached price → reject" rule.

---

## 5. Abstract Interface — `interface.py`

```python
"""Abstract interface for market data sources."""

from __future__ import annotations

from abc import ABC, abstractmethod


class MarketDataSource(ABC):
    """Contract for market data providers.

    Implementations push price updates into a shared PriceCache on their own
    schedule. Downstream code never calls the data source directly for prices —
    it reads from the cache.

    Lifecycle:
        source = create_market_data_source(cache)
        await source.start(["AAPL", "GOOGL", ...])
        # ... app runs ...
        await source.add_ticker("TSLA")
        await source.remove_ticker("GOOGL")
        # ... app shutting down ...
        await source.stop()
    """

    @abstractmethod
    async def start(self, tickers: list[str]) -> None:
        """Begin producing price updates for the given tickers.

        Starts a background task that periodically writes to the PriceCache.
        Must be called exactly once. Calling start() twice is undefined behavior.
        """

    @abstractmethod
    async def stop(self) -> None:
        """Stop the background task and release resources.

        Safe to call multiple times. After stop(), the source will not write
        to the cache again.
        """

    @abstractmethod
    async def add_ticker(self, ticker: str) -> None:
        """Add a ticker to the active set. No-op if already present.

        The next update cycle will include this ticker.
        """

    @abstractmethod
    async def remove_ticker(self, ticker: str) -> None:
        """Remove a ticker from the active set. No-op if not present.

        Also removes the ticker from the PriceCache.
        """

    @abstractmethod
    def get_tickers(self) -> list[str]:
        """Return the current list of actively tracked tickers."""
```

### Why the source writes to the cache instead of returning prices

This push model decouples timing from the caller. The simulator ticks every 500ms; Massive polls every 15s on the free tier; the SSE loop always reads the cache at its own fixed cadence. Neither the SSE layer nor trade execution needs to know which source is active or how frequently it updates — it only cares whether `PriceCache.get(ticker)` returns something.

---

## 6. Seed Prices & Ticker Parameters — `seed_prices.py`

Constants only — no logic, no imports beyond the type hints. Shared by the simulator for initial prices and GBM parameters.

```python
"""Seed prices and per-ticker parameters for the market simulator."""

# Realistic starting prices for the default watchlist (as of project creation)
SEED_PRICES: dict[str, float] = {
    "AAPL": 190.00,
    "GOOGL": 175.00,
    "MSFT": 420.00,
    "AMZN": 185.00,
    "TSLA": 250.00,
    "NVDA": 800.00,
    "META": 500.00,
    "JPM": 195.00,
    "V": 280.00,
    "NFLX": 600.00,
}

# Per-ticker GBM parameters
# sigma: annualized volatility (higher = more price movement)
# mu: annualized drift / expected return
TICKER_PARAMS: dict[str, dict[str, float]] = {
    "AAPL": {"sigma": 0.22, "mu": 0.05},
    "GOOGL": {"sigma": 0.25, "mu": 0.05},
    "MSFT": {"sigma": 0.20, "mu": 0.05},
    "AMZN": {"sigma": 0.28, "mu": 0.05},
    "TSLA": {"sigma": 0.50, "mu": 0.03},  # High volatility
    "NVDA": {"sigma": 0.40, "mu": 0.08},  # High volatility, strong drift
    "META": {"sigma": 0.30, "mu": 0.05},
    "JPM": {"sigma": 0.18, "mu": 0.04},  # Low volatility (bank)
    "V": {"sigma": 0.17, "mu": 0.04},  # Low volatility (payments)
    "NFLX": {"sigma": 0.35, "mu": 0.05},
}

# Default parameters for tickers not in the list above (dynamically added)
DEFAULT_PARAMS: dict[str, float] = {"sigma": 0.25, "mu": 0.05}

# Correlation groups for the simulator's Cholesky decomposition
# Tickers in the same group have higher intra-group correlation
CORRELATION_GROUPS: dict[str, set[str]] = {
    "tech": {"AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "NFLX"},
    "finance": {"JPM", "V"},
}

# Correlation coefficients
INTRA_TECH_CORR = 0.6  # Tech stocks move together
INTRA_FINANCE_CORR = 0.5  # Finance stocks move together
CROSS_GROUP_CORR = 0.3  # Between sectors / unknown tickers
TSLA_CORR = 0.3  # TSLA does its own thing
```

A ticker added dynamically that isn't in `TICKER_PARAMS` (e.g. a user typing `PYPL` into the watchlist) falls back to `DEFAULT_PARAMS` for volatility/drift and a uniform-random seed price in `$50–$300` — see `GBMSimulator._add_ticker_internal` below. This satisfies `PLAN.md` §8's watchlist rule: *"Simulator mode: any well-formed symbol is accepted and starts at a default seed price with `DEFAULT_PARAMS` volatility/drift."*

---

## 7. GBM Simulator — `simulator.py`

This file has two classes: `GBMSimulator` (pure math engine, no asyncio) and `SimulatorDataSource` (the `MarketDataSource` implementation that wraps it in an async loop and writes to the cache).

### 7.1 The math

Each tick, every ticker's price evolves as Geometric Brownian Motion:

```
S(t+dt) = S(t) * exp((mu - sigma²/2) * dt + sigma * sqrt(dt) * Z)
```

where `mu` is annualized drift, `sigma` is annualized volatility, `dt` is the tick length expressed as a fraction of a trading year, and `Z` is a (correlated) standard normal draw. GBM guarantees prices stay strictly positive (`exp()` is always positive) and reproduces the lognormal return distribution real equities exhibit.

For 500ms ticks over a 252-day, 6.5-hour trading year:

```
dt = 0.5 / (252 * 6.5 * 3600) ≈ 8.48e-8
```

This tiny `dt` produces sub-cent moves per tick that accumulate naturally into realistic intraday ranges over minutes of streaming.

### 7.2 Correlated moves

Real stocks don't move independently — tech names tend to move together. A **Cholesky decomposition** of a sector-based correlation matrix turns independent normal draws into correlated ones: given correlation matrix `C`, compute `L = cholesky(C)`, then `Z_correlated = L @ Z_independent`.

| Pair | Correlation |
|---|---|
| Two tech tickers (`AAPL`, `GOOGL`, `MSFT`, `AMZN`, `META`, `NVDA`, `NFLX`) | 0.6 |
| Two finance tickers (`JPM`, `V`) | 0.5 |
| Either ticker is `TSLA` | 0.3 (it does its own thing) |
| Cross-sector / unknown tickers | 0.3 |

### 7.3 Random shock events

Every step, each ticker independently has a ~0.1% chance of a sudden 2–5% move (either direction) — visual drama for the demo, roughly one notable event every ~50 seconds across a 10-ticker watchlist at 2 ticks/sec.

### 7.4 Full source

```python
"""GBM-based market simulator."""

from __future__ import annotations

import asyncio
import logging
import math
import random

import numpy as np

from .cache import PriceCache
from .interface import MarketDataSource
from .seed_prices import (
    CORRELATION_GROUPS,
    CROSS_GROUP_CORR,
    DEFAULT_PARAMS,
    INTRA_FINANCE_CORR,
    INTRA_TECH_CORR,
    SEED_PRICES,
    TICKER_PARAMS,
    TSLA_CORR,
)

logger = logging.getLogger(__name__)


class GBMSimulator:
    """Geometric Brownian Motion simulator for correlated stock prices.

    Math:
        S(t+dt) = S(t) * exp((mu - sigma^2/2) * dt + sigma * sqrt(dt) * Z)

    The tiny dt (~8.5e-8 for 500ms ticks over 252 trading days * 6.5h/day)
    produces sub-cent moves per tick that accumulate naturally over time.
    """

    TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600  # 5,896,800
    DEFAULT_DT = 0.5 / TRADING_SECONDS_PER_YEAR  # ~8.48e-8

    def __init__(
        self,
        tickers: list[str],
        dt: float = DEFAULT_DT,
        event_probability: float = 0.001,
    ) -> None:
        self._dt = dt
        self._event_prob = event_probability

        self._tickers: list[str] = []
        self._prices: dict[str, float] = {}
        self._params: dict[str, dict[str, float]] = {}
        self._cholesky: np.ndarray | None = None

        for ticker in tickers:
            self._add_ticker_internal(ticker)
        self._rebuild_cholesky()

    # --- Public API ---

    def step(self) -> dict[str, float]:
        """Advance all tickers by one time step. Returns {ticker: new_price}.

        This is the hot path — called every 500ms. Keep it fast.
        """
        n = len(self._tickers)
        if n == 0:
            return {}

        z_independent = np.random.standard_normal(n)
        z_correlated = self._cholesky @ z_independent if self._cholesky is not None else z_independent

        result: dict[str, float] = {}
        for i, ticker in enumerate(self._tickers):
            params = self._params[ticker]
            mu, sigma = params["mu"], params["sigma"]

            drift = (mu - 0.5 * sigma**2) * self._dt
            diffusion = sigma * math.sqrt(self._dt) * z_correlated[i]
            self._prices[ticker] *= math.exp(drift + diffusion)

            # Random event: ~0.1% chance per tick per ticker
            if random.random() < self._event_prob:
                shock_magnitude = random.uniform(0.02, 0.05)
                shock_sign = random.choice([-1, 1])
                self._prices[ticker] *= 1 + shock_magnitude * shock_sign
                logger.debug(
                    "Random event on %s: %.1f%% %s",
                    ticker, shock_magnitude * 100, "up" if shock_sign > 0 else "down",
                )

            result[ticker] = round(self._prices[ticker], 2)

        return result

    def add_ticker(self, ticker: str) -> None:
        """Add a ticker to the simulation. Rebuilds the correlation matrix."""
        if ticker in self._prices:
            return
        self._add_ticker_internal(ticker)
        self._rebuild_cholesky()

    def remove_ticker(self, ticker: str) -> None:
        """Remove a ticker from the simulation. Rebuilds the correlation matrix."""
        if ticker not in self._prices:
            return
        self._tickers.remove(ticker)
        del self._prices[ticker]
        del self._params[ticker]
        self._rebuild_cholesky()

    def get_price(self, ticker: str) -> float | None:
        """Current price for a ticker, or None if not tracked."""
        return self._prices.get(ticker)

    def get_tickers(self) -> list[str]:
        """Return the list of currently tracked tickers."""
        return list(self._tickers)

    # --- Internals ---

    def _add_ticker_internal(self, ticker: str) -> None:
        """Add a ticker without rebuilding Cholesky (for batch initialization)."""
        if ticker in self._prices:
            return
        self._tickers.append(ticker)
        self._prices[ticker] = SEED_PRICES.get(ticker, random.uniform(50.0, 300.0))
        self._params[ticker] = TICKER_PARAMS.get(ticker, dict(DEFAULT_PARAMS))

    def _rebuild_cholesky(self) -> None:
        """Rebuild the Cholesky decomposition of the ticker correlation matrix.

        Called whenever tickers are added or removed. O(n^2) but n < 50.
        """
        n = len(self._tickers)
        if n <= 1:
            self._cholesky = None
            return

        corr = np.eye(n)
        for i in range(n):
            for j in range(i + 1, n):
                rho = self._pairwise_correlation(self._tickers[i], self._tickers[j])
                corr[i, j] = rho
                corr[j, i] = rho

        self._cholesky = np.linalg.cholesky(corr)

    @staticmethod
    def _pairwise_correlation(t1: str, t2: str) -> float:
        """Determine correlation between two tickers based on sector grouping."""
        tech = CORRELATION_GROUPS["tech"]
        finance = CORRELATION_GROUPS["finance"]

        if t1 == "TSLA" or t2 == "TSLA":
            return TSLA_CORR
        if t1 in tech and t2 in tech:
            return INTRA_TECH_CORR
        if t1 in finance and t2 in finance:
            return INTRA_FINANCE_CORR
        return CROSS_GROUP_CORR


class SimulatorDataSource(MarketDataSource):
    """MarketDataSource backed by the GBM simulator.

    Runs a background asyncio task that calls GBMSimulator.step() every
    `update_interval` seconds and writes results to the PriceCache.
    """

    def __init__(
        self,
        price_cache: PriceCache,
        update_interval: float = 0.5,
        event_probability: float = 0.001,
    ) -> None:
        self._cache = price_cache
        self._interval = update_interval
        self._event_prob = event_probability
        self._sim: GBMSimulator | None = None
        self._task: asyncio.Task | None = None

    async def start(self, tickers: list[str]) -> None:
        self._sim = GBMSimulator(tickers=tickers, event_probability=self._event_prob)
        # Seed the cache with initial prices so SSE has data immediately
        for ticker in tickers:
            price = self._sim.get_price(ticker)
            if price is not None:
                self._cache.update(ticker=ticker, price=price)
        self._task = asyncio.create_task(self._run_loop(), name="simulator-loop")
        logger.info("Simulator started with %d tickers", len(tickers))

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info("Simulator stopped")

    async def add_ticker(self, ticker: str) -> None:
        if self._sim:
            self._sim.add_ticker(ticker)
            # Seed cache immediately so the ticker has a price right away
            price = self._sim.get_price(ticker)
            if price is not None:
                self._cache.update(ticker=ticker, price=price)
            logger.info("Simulator: added ticker %s", ticker)

    async def remove_ticker(self, ticker: str) -> None:
        if self._sim:
            self._sim.remove_ticker(ticker)
        self._cache.remove(ticker)
        logger.info("Simulator: removed ticker %s", ticker)

    def get_tickers(self) -> list[str]:
        return self._sim.get_tickers() if self._sim else []

    async def _run_loop(self) -> None:
        """Core loop: step the simulation, write to cache, sleep."""
        while True:
            try:
                if self._sim:
                    prices = self._sim.step()
                    for ticker, price in prices.items():
                        self._cache.update(ticker=ticker, price=price)
            except Exception:
                logger.exception("Simulator step failed")
            await asyncio.sleep(self._interval)
```

### Key behaviors

- **Immediate seeding.** `start()` populates the cache with seed prices *before* the loop begins, so the SSE endpoint has data on its very first poll — no blank-screen delay, satisfying the "waiting for price" vs. instant-availability distinction in `PLAN.md` §8.
- **Graceful cancellation.** `stop()` cancels the task and awaits it, swallowing `CancelledError` — clean shutdown under FastAPI's lifespan teardown.
- **Exception resilience.** `_run_loop` catches exceptions per-tick so one bad step doesn't kill the feed for the rest of the session.
- **`get_tickers()` is public on `GBMSimulator` itself** — `SimulatorDataSource.get_tickers()` delegates to it rather than reaching into a private attribute.

---

## 8. Massive API Client — `massive_client.py`

Polls the Massive (formerly Polygon.io) REST snapshot endpoint on a configurable interval. The Massive `RESTClient` is synchronous, so calls run inside `asyncio.to_thread()` to avoid blocking the event loop.

```python
"""Massive (Polygon.io) API client for real market data."""

from __future__ import annotations

import asyncio
import logging

from massive import RESTClient
from massive.rest.models import SnapshotMarketType

from .cache import PriceCache
from .interface import MarketDataSource

logger = logging.getLogger(__name__)


class MassiveDataSource(MarketDataSource):
    """MarketDataSource backed by the Massive (Polygon.io) REST API.

    Polls GET /v2/snapshot/locale/us/markets/stocks/tickers for all watched
    tickers in a single API call, then writes results to the PriceCache.

    Rate limits:
      - Free tier: 5 req/min → poll every 15s (default)
      - Paid tiers: higher limits → poll every 2-5s
    """

    def __init__(
        self,
        api_key: str,
        price_cache: PriceCache,
        poll_interval: float = 15.0,
    ) -> None:
        self._api_key = api_key
        self._cache = price_cache
        self._interval = poll_interval
        self._tickers: list[str] = []
        self._task: asyncio.Task | None = None
        self._client: RESTClient | None = None

    async def start(self, tickers: list[str]) -> None:
        self._client = RESTClient(api_key=self._api_key)
        self._tickers = list(tickers)

        # Do an immediate first poll so the cache has data right away
        await self._poll_once()

        self._task = asyncio.create_task(self._poll_loop(), name="massive-poller")
        logger.info(
            "Massive poller started: %d tickers, %.1fs interval",
            len(tickers), self._interval,
        )

    async def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        self._client = None
        logger.info("Massive poller stopped")

    async def add_ticker(self, ticker: str) -> None:
        ticker = ticker.upper().strip()
        if ticker not in self._tickers:
            self._tickers.append(ticker)
            logger.info("Massive: added ticker %s (will appear on next poll)", ticker)

    async def remove_ticker(self, ticker: str) -> None:
        ticker = ticker.upper().strip()
        self._tickers = [t for t in self._tickers if t != ticker]
        self._cache.remove(ticker)
        logger.info("Massive: removed ticker %s", ticker)

    def get_tickers(self) -> list[str]:
        return list(self._tickers)

    # --- Internal ---

    async def _poll_loop(self) -> None:
        """Poll on interval. First poll already happened in start()."""
        while True:
            await asyncio.sleep(self._interval)
            await self._poll_once()

    async def _poll_once(self) -> None:
        """Execute one poll cycle: fetch snapshots, update cache."""
        if not self._tickers or not self._client:
            return

        try:
            # The Massive RESTClient is synchronous — run in a thread to
            # avoid blocking the event loop.
            snapshots = await asyncio.to_thread(self._fetch_snapshots)
            processed = 0
            for snap in snapshots:
                try:
                    price = snap.last_trade.price
                    # Massive timestamps are Unix milliseconds → convert to seconds
                    timestamp = snap.last_trade.timestamp / 1000.0
                    self._cache.update(ticker=snap.ticker, price=price, timestamp=timestamp)
                    processed += 1
                except (AttributeError, TypeError) as e:
                    logger.warning("Skipping snapshot for %s: %s", getattr(snap, "ticker", "???"), e)
            logger.debug("Massive poll: updated %d/%d tickers", processed, len(self._tickers))

        except Exception as e:
            logger.error("Massive poll failed: %s", e)
            # Don't re-raise — the loop will retry on the next interval.
            # Common failures: 401 (bad key), 429 (rate limit), network errors.

    def _fetch_snapshots(self) -> list:
        """Synchronous call to the Massive REST API. Runs in a thread."""
        return self._client.get_snapshot_all(
            market_type=SnapshotMarketType.STOCKS,
            tickers=self._tickers,
        )
```

Note that `RESTClient` and `SnapshotMarketType` are imported at **module level**, not lazily inside `start()`. `massive` is a core dependency in `pyproject.toml` (`massive>=1.0.0`), so there's no need to defer the import — and a top-level import is what makes `unittest.mock.patch("app.market.massive_client.RESTClient", ...)` work cleanly in tests without `create=True`.

### Massive REST API reference

| Endpoint | Client call | Used for |
|---|---|---|
| `GET /v2/snapshot/locale/us/markets/stocks/tickers` | `client.get_snapshot_all(market_type=SnapshotMarketType.STOCKS, tickers=[...])` | The only endpoint the poller calls — gets every watched ticker's latest price in **one** API call, which is what keeps polling within the free tier's 5 req/min budget. |

Response fields consumed: `snap.ticker`, `snap.last_trade.price`, `snap.last_trade.timestamp` (Unix **milliseconds**, hence the `/ 1000.0` conversion). Other fields on the snapshot (`day.open/high/low/close`, `last_quote.bid/ask`, `prev_daily_bar`) exist in the Massive response but are not used — the subsystem intentionally exposes only `PriceUpdate`'s fields, and `PLAN.md` §6 rules out intraday-bar fetches as out of scope.

```python
from massive import RESTClient
from massive.rest.models import SnapshotMarketType

client = RESTClient(api_key="...")
snapshots = client.get_snapshot_all(
    market_type=SnapshotMarketType.STOCKS,
    tickers=["AAPL", "GOOGL", "MSFT"],
)
for snap in snapshots:
    print(snap.ticker, snap.last_trade.price, snap.last_trade.timestamp)
```

### Error handling philosophy

| Error | Behavior |
|---|---|
| **401 Unauthorized** (bad key) | Logged as error; poller keeps running so a corrected `.env` + restart recovers without code changes. |
| **429 Rate Limited** | Logged as error; next scheduled poll retries — no backoff needed since the interval already respects the rate limit. |
| **Network timeout** | Logged as error; retried automatically on the next cycle. |
| **Malformed snapshot** (missing `last_trade`) | That one ticker is skipped with a warning; the rest of the batch still updates. |
| **Every ticker fails** | Cache keeps its last-known values. The SSE stream keeps serving stale-but-present data rather than gaps — better than a blank UI. |

---

## 9. Factory — `factory.py`

```python
"""Factory for creating market data sources."""

from __future__ import annotations

import logging
import os

from .cache import PriceCache
from .interface import MarketDataSource
from .massive_client import MassiveDataSource
from .simulator import SimulatorDataSource

logger = logging.getLogger(__name__)


def create_market_data_source(price_cache: PriceCache) -> MarketDataSource:
    """Create the appropriate market data source based on environment variables.

    - MASSIVE_API_KEY set and non-empty → MassiveDataSource (real market data)
    - Otherwise → SimulatorDataSource (GBM simulation)

    Returns an unstarted source. Caller must await source.start(tickers).
    """
    api_key = os.environ.get("MASSIVE_API_KEY", "").strip()

    if api_key:
        logger.info("Market data source: Massive API (real data)")
        return MassiveDataSource(api_key=api_key, price_cache=price_cache)
    else:
        logger.info("Market data source: GBM Simulator")
        return SimulatorDataSource(price_cache=price_cache)
```

This is the single environment-variable branch point in the whole subsystem (`PLAN.md` §5). Everything above and below this function is agnostic to which source is active.

```python
price_cache = PriceCache()
source = create_market_data_source(price_cache)   # Reads MASSIVE_API_KEY
await source.start(initial_tickers)                # e.g. ["AAPL", "GOOGL", ...]
```

---

## 10. SSE Streaming Endpoint — `stream.py`

A FastAPI route holding a long-lived `text/event-stream` connection, pushing price updates as they change.

```python
"""SSE streaming endpoint for live price updates."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from .cache import PriceCache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/stream", tags=["streaming"])


def create_stream_router(price_cache: PriceCache) -> APIRouter:
    """Create the SSE streaming router with a reference to the price cache.

    This factory pattern lets us inject the PriceCache without globals.
    """

    @router.get("/prices")
    async def stream_prices(request: Request) -> StreamingResponse:
        """SSE endpoint for live price updates.

        Streams all tracked ticker prices every ~500ms. The client connects
        with EventSource and receives events in the format:

            data: {"AAPL": {"ticker": "AAPL", "price": 190.50, ...}, ...}

        Includes a retry directive so the browser auto-reconnects on
        disconnection (EventSource built-in behavior).
        """
        return StreamingResponse(
            _generate_events(price_cache, request),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering if proxied
            },
        )

    return router


async def _generate_events(
    price_cache: PriceCache,
    request: Request,
    interval: float = 0.5,
) -> AsyncGenerator[str, None]:
    """Async generator that yields SSE-formatted price events.

    Sends all prices every `interval` seconds. Stops when the client
    disconnects (detected via request.is_disconnected()).
    """
    # Tell the client to retry after 1 second if the connection drops
    yield "retry: 1000\n\n"

    last_version = -1
    client_ip = request.client.host if request.client else "unknown"
    logger.info("SSE client connected: %s", client_ip)

    try:
        while True:
            if await request.is_disconnected():
                logger.info("SSE client disconnected: %s", client_ip)
                break

            current_version = price_cache.version
            if current_version != last_version:
                last_version = current_version
                prices = price_cache.get_all()

                if prices:
                    data = {ticker: update.to_dict() for ticker, update in prices.items()}
                    payload = json.dumps(data)
                    yield f"data: {payload}\n\n"

            await asyncio.sleep(interval)
    except asyncio.CancelledError:
        logger.info("SSE stream cancelled for: %s", client_ip)
```

### Wire format

```
retry: 1000

data: {"AAPL":{"ticker":"AAPL","price":190.5,"previous_price":190.42,"timestamp":1756000000.123,"change":0.08,"change_percent":0.042,"direction":"up"},"GOOGL":{...}}

```

Every payload carries **all** tracked tickers in one JSON object keyed by symbol — never one SSE event per ticker — exactly as `PLAN.md` §6 specifies. Frontend consumption:

```javascript
const eventSource = new EventSource('/api/stream/prices');
eventSource.onmessage = (event) => {
  const prices = JSON.parse(event.data);
  // prices is { "AAPL": { ticker, price, previous_price, timestamp, change, change_percent, direction }, ... }
};
```

### Why poll-and-push instead of event-driven

The loop polls the cache on a fixed interval rather than being notified by the data source. That's simpler and produces evenly-spaced updates, which matters because the frontend accumulates these ticks directly into sparkline and main-chart series — regular spacing keeps that client-side charting clean without any smoothing logic.

---

## 11. FastAPI Lifecycle Integration

The market data subsystem starts and stops with the FastAPI app via the `lifespan` context manager. **This wiring lives in `backend/app/main.py`, which does not exist yet** — the block below is the integration contract the API layer should implement when it's built.

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.market import PriceCache, create_market_data_source, create_stream_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---

    # 1. One shared price cache for the app's lifetime
    price_cache = PriceCache()
    app.state.price_cache = price_cache

    # 2. Select simulator vs. Massive based on MASSIVE_API_KEY
    source = create_market_data_source(price_cache)
    app.state.market_source = source

    # 3. Tracked ticker set = watchlist ∪ open positions (§12 below) — NOT
    #    just the watchlist. This union is computed by the database layer.
    initial_tickers = await load_tracked_tickers()  # watchlist + position tickers, from SQLite
    await source.start(initial_tickers)

    # 4. Mount the SSE router
    app.include_router(create_stream_router(price_cache))

    yield  # app is running

    # --- SHUTDOWN ---
    await source.stop()


app = FastAPI(title="Artifinancial", lifespan=lifespan)


def get_price_cache() -> PriceCache:
    return app.state.price_cache


def get_market_source() -> MarketDataSource:
    return app.state.market_source
```

### Accessing market data from other routes

Trade execution, watchlist management, and portfolio valuation reach the cache and source via FastAPI dependency injection — never by importing a module-level singleton:

```python
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/api")


@router.post("/portfolio/trade")
async def execute_trade(trade: TradeRequest, price_cache: PriceCache = Depends(get_price_cache)):
    current_price = price_cache.get_price(trade.ticker)
    if current_price is None:
        raise HTTPException(400, f"No price available for {trade.ticker} yet")
    # ... validate quantity/cash/shares per PLAN.md §8, then fill at current_price ...


@router.post("/watchlist")
async def add_to_watchlist(
    payload: WatchlistAdd,
    source: MarketDataSource = Depends(get_market_source),
):
    # ... insert into watchlist table ...
    await source.add_ticker(payload.ticker)
    # ...


@router.delete("/watchlist/{ticker}")
async def remove_from_watchlist(
    ticker: str,
    source: MarketDataSource = Depends(get_market_source),
):
    # ... delete from watchlist table, then see §12 for the position check ...
```

---

## 12. Watchlist Coordination — the Tracked Ticker Set

The watchlist table (SQLite) and the market data source's active ticker set are two independent pieces of state. `PLAN.md` §8 defines the invariant the API layer must maintain between them:

> **The set of tickers tracked by the market data source is the union of the watchlist and all tickers with an open position.**

Positions need this because valuing a position and allowing it to be sold both require a cached price (§4, §5 — "No cached price → reject"), and a position can outlive its watchlist entry.

### On startup

```python
watchlist_tickers = await db.get_watchlist_tickers()
position_tickers = await db.get_position_tickers()
initial_tickers = list(set(watchlist_tickers) | set(position_tickers))
await source.start(initial_tickers)
```

### Adding a ticker

```
POST /api/watchlist {ticker: "PYPL"}
  → INSERT INTO watchlist ...
  → await source.add_ticker("PYPL")
      Simulator: adds to GBMSimulator, rebuilds Cholesky, seeds cache immediately
      Massive:   appends to polled ticker list, price appears on next poll (≤15s on free tier)
```

### Removing a ticker — the conditional that matters

```
DELETE /api/watchlist/{ticker}
  → DELETE FROM watchlist ...
  → position = await db.get_position(ticker)
  → if position is None:
        await source.remove_ticker(ticker)   # only when no open position remains
  # else: leave it tracked — the position still needs a live price
```

`remove_ticker()` evicts the ticker from the shared `PriceCache` (see `simulator.py`'s `SimulatorDataSource.remove_ticker` and `massive_client.py`'s `MassiveDataSource.remove_ticker`, both above). Calling it unconditionally on a ticker with an open position would drop its price from the cache — making that position's value go stale or zero in `GET /api/portfolio`, and making it impossible to close the position at all, since a sell for a ticker with no cached price is rejected by the same rule that protects buys. **That's the exact bug this invariant exists to prevent**, and the reason the `DELETE /api/watchlist/{ticker}` handler must check for an open position before calling `source.remove_ticker()`.

### Add latency differs by source

This is what the "waiting for price" UI state in `PLAN.md` §8 is for: the simulator seeds the cache synchronously inside `add_ticker()`, so a price exists the instant the call returns. The Massive poller only picks a newly-added ticker up on its next scheduled cycle — up to 15 seconds on the free tier. A ticker just added to the watchlist can legitimately have no price yet; that's an expected transient state, not an error.

---

## 13. Testing Strategy

Test suite lives in `backend/tests/market/`, mirroring the module layout:

| File | What it covers |
|---|---|
| `test_models.py` | `PriceUpdate.change`, `change_percent`, `direction` for up/down/flat/zero-previous-price cases; `to_dict()` shape |
| `test_cache.py` | `update`/`get`/`get_all`/`get_price`/`remove`, first-update-is-flat, version increments on every write |
| `test_simulator.py` | `GBMSimulator.step()` returns all tickers, prices stay positive over many steps, add/remove ticker rebuilds Cholesky, unknown ticker gets a random seed in `$50–$300`, empty ticker list steps to `{}` |
| `test_simulator_source.py` | `SimulatorDataSource.start()` seeds the cache before the first tick, prices change over time, `stop()` is idempotent, `add_ticker`/`remove_ticker` reach both the simulator and the cache |
| `test_factory.py` | `MASSIVE_API_KEY` set → `MassiveDataSource`; unset/empty → `SimulatorDataSource` |
| `test_massive.py` | `_poll_once()` updates the cache from mocked snapshots, a malformed snapshot is skipped without aborting the batch, an API exception doesn't crash the poller |

Representative patterns:

```python
# test_simulator.py
class TestGBMSimulator:
    def test_prices_are_positive(self):
        """GBM prices can never go negative (exp() is always positive)."""
        sim = GBMSimulator(tickers=["AAPL"])
        for _ in range(10_000):
            prices = sim.step()
            assert prices["AAPL"] > 0

    def test_cholesky_rebuilds_on_add(self):
        sim = GBMSimulator(tickers=["AAPL"])
        assert sim._cholesky is None          # 1 ticker → no correlation matrix
        sim.add_ticker("GOOGL")
        assert sim._cholesky is not None       # 2 tickers → matrix exists
```

```python
# test_massive.py — mocking the Massive snapshot response
def _make_snapshot(ticker: str, price: float, timestamp_ms: int) -> MagicMock:
    snap = MagicMock()
    snap.ticker = ticker
    snap.last_trade.price = price
    snap.last_trade.timestamp = timestamp_ms
    return snap

async def test_malformed_snapshot_skipped(self):
    cache = PriceCache()
    source = MassiveDataSource(api_key="test-key", price_cache=cache, poll_interval=60.0)
    source._tickers = ["AAPL", "BAD"]

    good = _make_snapshot("AAPL", 190.50, 1707580800000)
    bad = MagicMock(ticker="BAD", last_trade=None)  # triggers AttributeError

    with patch.object(source, "_fetch_snapshots", return_value=[good, bad]):
        await source._poll_once()

    assert cache.get_price("AAPL") == 190.50
    assert cache.get_price("BAD") is None
```

Run locally:

```bash
cd backend
uv run --extra dev pytest tests/market -v
uv run --extra dev pytest tests/market --cov=app.market
```

### What downstream API/portfolio tests should cover (§8 and §12 of `PLAN.md`, not yet built)

- Trading a ticker with no cached price returns `400`.
- `POST /api/watchlist` calls `source.add_ticker()` after the DB insert.
- `DELETE /api/watchlist/{ticker}` calls `source.remove_ticker()` only when no position remains for that ticker, and skips the call when a position exists.
- App startup computes the tracked ticker set as the union of watchlist and position tickers, not the watchlist alone.

---

## 14. Error Handling & Edge Cases

| Situation | Behavior |
|---|---|
| **Empty ticker list at startup** | Both sources accept `[]` gracefully — simulator produces no prices, Massive poller skips the API call. SSE sends nothing until a ticker is added. |
| **Trade against an uncached ticker** | Reject with `400` and a message like `"No price available for PYPL yet"` — the trade layer's job, using `price_cache.get_price()`. |
| **Massive API key invalid** | First poll fails with 401; the poller logs and keeps retrying rather than crashing. SSE stays "connected" but streams no data for that source until the key is fixed and the app restarted. |
| **Massive poll transiently fails (network, 429)** | Cache retains its last-known values; SSE keeps serving them. Failure is logged, not raised, so one bad poll never kills the background task. |
| **Concurrent cache access** | `threading.Lock` serializes all reads/writes; the critical section is a dict lookup/assignment, so contention is negligible at the tickers/updates-per-second this project runs at. |
| **GBM numerical stability** | Prices are `round()`ed to 2 decimals each step; the exponential formulation is numerically stable; prices are provably always positive. |
| **Watchlist ticker with no symbol-existence check** | Per `PLAN.md` §8, format is validated (`^[A-Z]{1,5}$`) but existence is not. In simulator mode any well-formed symbol gets a seed price immediately; in Massive mode an unknown symbol simply never receives a price and stays in "waiting for price" state — this is a deliberate trade-off, not a bug, to avoid a symbol-lookup API call. |

---

## 15. Configuration Summary

| Parameter | Location | Default | Description |
|---|---|---|---|
| `MASSIVE_API_KEY` | Environment variable | `""` (empty) | If set and non-empty, use Massive; otherwise use the simulator. |
| `update_interval` | `SimulatorDataSource.__init__` | `0.5` s | Time between simulator ticks. |
| `poll_interval` | `MassiveDataSource.__init__` | `15.0` s | Time between Massive API polls (free-tier default; lower on paid tiers). |
| `event_probability` | `GBMSimulator.__init__` | `0.001` | Chance of a random shock event per ticker per tick. |
| `dt` | `GBMSimulator.__init__` | `~8.48e-8` | GBM time step, as a fraction of a trading year. |
| SSE push interval | `_generate_events()` | `0.5` s | How often the SSE loop checks the cache for new data. |
| SSE retry directive | `_generate_events()` | `1000` ms | Browser `EventSource` auto-reconnect delay. |

---

## 16. Terminal Demo

`backend/market_data_demo.py` is a standalone Rich-powered terminal dashboard exercising the simulator end to end — useful for sanity-checking changes to `simulator.py` or `cache.py` without spinning up FastAPI:

```bash
cd backend
uv run market_data_demo.py
```

It builds a `PriceCache` + `SimulatorDataSource` directly (no FastAPI involved), drives them for 60 seconds, and renders a live table with per-ticker sparklines, up/down arrows, and an event log that highlights any tick with `|change_percent| > 1%` — a quick visual check that GBM, correlation, and shock events are all behaving.

```python
# market_data_demo.py — core loop, abbreviated
cache = PriceCache()
source = SimulatorDataSource(price_cache=cache, update_interval=0.5)
await source.start(TICKERS)

with Live(build_dashboard(cache, history, events, start_time), refresh_per_second=4, screen=True) as live:
    last_version = cache.version
    while time.time() - start_time < DURATION:
        await asyncio.sleep(0.25)
        if cache.version == last_version:
            continue
        last_version = cache.version
        # ... append to per-ticker history for sparklines, log notable moves ...
        live.update(build_dashboard(cache, history, events, start_time))
```
