"""A market data source that records calls instead of generating prices."""

from app.market import MarketDataSource


class FakeSource(MarketDataSource):
    """Records add/remove calls and mirrors them into the shared price cache."""

    def __init__(self, price_cache):
        self.price_cache = price_cache
        self.tickers: list[str] = []
        self.added: list[str] = []
        self.removed: list[str] = []
        self.started_with: list[str] | None = None

    async def start(self, tickers):
        self.started_with = list(tickers)
        self.tickers = list(tickers)

    async def stop(self):
        self.tickers = []

    async def add_ticker(self, ticker):
        self.added.append(ticker)
        if ticker not in self.tickers:
            self.tickers.append(ticker)

    async def remove_ticker(self, ticker):
        self.removed.append(ticker)
        if ticker in self.tickers:
            self.tickers.remove(ticker)
        self.price_cache.remove(ticker)

    def get_tickers(self):
        return list(self.tickers)
