/**
 * Seed prices and GBM parameters, ported from backend/app/market/seed_prices.py.
 *
 * Kept identical to the Python: the browser engine and the container have to
 * start the same market, or the same demo behaves differently depending on how
 * it was served.
 */

/** Realistic starting prices for the default watchlist. */
export const SEED_PRICES: Record<string, number> = {
  AAPL: 190.0,
  GOOGL: 175.0,
  MSFT: 420.0,
  AMZN: 185.0,
  TSLA: 250.0,
  NVDA: 800.0,
  META: 500.0,
  JPM: 195.0,
  V: 280.0,
  NFLX: 600.0,
};

export interface TickerParams {
  /** Annualized volatility. Higher means more movement. */
  sigma: number;
  /** Annualized drift, the expected return. */
  mu: number;
}

export const TICKER_PARAMS: Record<string, TickerParams> = {
  AAPL: { sigma: 0.22, mu: 0.05 },
  GOOGL: { sigma: 0.25, mu: 0.05 },
  MSFT: { sigma: 0.2, mu: 0.05 },
  AMZN: { sigma: 0.28, mu: 0.05 },
  TSLA: { sigma: 0.5, mu: 0.03 }, // High volatility
  NVDA: { sigma: 0.4, mu: 0.08 }, // High volatility, strong drift
  META: { sigma: 0.3, mu: 0.05 },
  JPM: { sigma: 0.18, mu: 0.04 }, // Low volatility (bank)
  V: { sigma: 0.17, mu: 0.04 }, // Low volatility (payments)
  NFLX: { sigma: 0.35, mu: 0.05 },
};

/** Used for any ticker added at runtime that is not listed above. */
export const DEFAULT_PARAMS: TickerParams = { sigma: 0.25, mu: 0.05 };

export const CORRELATION_GROUPS: Record<string, Set<string>> = {
  tech: new Set(["AAPL", "GOOGL", "MSFT", "AMZN", "META", "NVDA", "NFLX"]),
  finance: new Set(["JPM", "V"]),
};

export const INTRA_TECH_CORR = 0.6; // Tech stocks move together
export const INTRA_FINANCE_CORR = 0.5; // Finance stocks move together
export const CROSS_GROUP_CORR = 0.3; // Between sectors, and unknown tickers
export const TSLA_CORR = 0.3; // TSLA does its own thing

/** The watchlist a fresh visitor starts with, from backend/app/db/seed.json. */
export const DEFAULT_TICKERS = [
  "AAPL",
  "GOOGL",
  "MSFT",
  "AMZN",
  "TSLA",
  "NVDA",
  "META",
  "JPM",
  "V",
  "NFLX",
];

/** Opening virtual cash, from the same seed file. */
export const STARTING_CASH = 10000.0;
