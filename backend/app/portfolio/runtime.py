"""Process-wide market data singletons.

The price cache and the market data source are created once at import time and
shared by the REST layer, the SSE stream, and the LLM chat layer. Tests replace
`source` with a fake; always reach it through the module (`runtime.source`),
never via `from ... import source`.
"""

from __future__ import annotations

from app.market import MarketDataSource, PriceCache, create_market_data_source

price_cache: PriceCache = PriceCache()
source: MarketDataSource = create_market_data_source(price_cache)
