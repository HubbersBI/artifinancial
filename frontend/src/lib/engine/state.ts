/**
 * The portfolio, ported from backend/app/db/ and backend/app/portfolio/.
 *
 * SQLite becomes a plain object here. That is not a downgrade: the database
 * held one user's simulated positions and nothing was ever shared between
 * visitors, so a per-browser object is the same thing with the server removed.
 *
 * The PLAN section 8 rules are carried over intact, and they are the reason
 * this file has tests:
 *   - a buy recomputes avg_cost as the weighted average of the lots
 *   - a position reaching zero is deleted, not stored as a zero row
 *   - a trade is validated before anything is written, so a rejected order
 *     leaves the portfolio untouched
 */

import type { PriceUpdate } from "@/lib/types";

import { DEFAULT_TICKERS, STARTING_CASH } from "./seed";

export const MONEY = 2;
export const QTY = 6;
/** Quantities below this are float dust left by selling out of a position. */
export const ZERO_QUANTITY = 1e-9;
const EPSILON = 1e-9;

export interface PositionRow {
  ticker: string;
  quantity: number;
  avg_cost: number;
}

export interface TradeRow {
  id: string;
  ticker: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  executed_at: string;
}

export interface SnapshotRow {
  total_value: number;
  recorded_at: string;
}

export interface StoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: unknown;
  created_at: string;
}

export interface PortfolioState {
  cash_balance: number;
  positions: PositionRow[];
  trades: TradeRow[];
  snapshots: SnapshotRow[];
  watchlist: string[];
  chat: StoredChatMessage[];
}

/** A rejected order or watchlist change. The message is shown to the user. */
export class EngineError extends Error {}

export function initialState(): PortfolioState {
  return {
    cash_balance: STARTING_CASH,
    positions: [],
    trades: [],
    snapshots: [],
    watchlist: [...DEFAULT_TICKERS],
    chat: [],
  };
}

export function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

// --- positions -------------------------------------------------------------

export function getPosition(state: PortfolioState, ticker: string): PositionRow | null {
  return state.positions.find((p) => p.ticker === ticker) ?? null;
}

/** Insert or update. A quantity at or below the dust threshold deletes the row. */
function upsertPosition(
  state: PortfolioState,
  ticker: string,
  quantity: number,
  avgCost: number,
): PositionRow | null {
  state.positions = state.positions.filter((p) => p.ticker !== ticker);
  if (quantity <= ZERO_QUANTITY) return null;
  const row: PositionRow = { ticker, quantity, avg_cost: avgCost };
  state.positions.push(row);
  state.positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
  return row;
}

/** Add shares, recomputing avg_cost as the weighted average of the lots. */
function applyBuy(
  state: PortfolioState,
  ticker: string,
  quantity: number,
  price: number,
): PositionRow | null {
  const existing = getPosition(state, ticker);
  if (!existing) return upsertPosition(state, ticker, quantity, price);
  const total = existing.quantity + quantity;
  const avgCost = (existing.quantity * existing.avg_cost + quantity * price) / total;
  return upsertPosition(state, ticker, total, avgCost);
}

/** Remove shares, leaving avg_cost alone. Returns null once flat. */
function applySell(state: PortfolioState, ticker: string, quantity: number): PositionRow | null {
  const existing = getPosition(state, ticker);
  if (!existing) return null;
  return upsertPosition(state, ticker, existing.quantity - quantity, existing.avg_cost);
}

// --- trades ----------------------------------------------------------------

export interface TradeResult {
  trade: TradeRow;
  position: { ticker: string; quantity: number; avg_cost: number } | null;
  cash_balance: number;
  total_value: number;
}

/**
 * Fill a market order at the ticker's latest cached price.
 *
 * Every check happens before any mutation, so a rejected order leaves the
 * portfolio exactly as it was.
 */
export function executeTrade(
  state: PortfolioState,
  priceOf: (ticker: string) => number | null,
  rawTicker: string,
  rawSide: string,
  quantity: number,
): TradeResult {
  const ticker = rawTicker.trim().toUpperCase();
  const side = rawSide.trim().toLowerCase();

  if (side !== "buy" && side !== "sell") throw new EngineError("Side must be 'buy' or 'sell'");
  if (!(quantity > 0)) throw new EngineError("Quantity must be greater than 0");

  const price = priceOf(ticker);
  if (price === null) throw new EngineError(`No price available for ${ticker} yet`);

  let position: PositionRow | null;
  if (side === "buy") {
    const cost = quantity * price;
    if (cost > state.cash_balance + EPSILON) {
      throw new EngineError(
        `Insufficient cash: need $${cost.toFixed(2)}, have $${state.cash_balance.toFixed(2)} ` +
          `(short $${(cost - state.cash_balance).toFixed(2)})`,
      );
    }
    state.cash_balance -= cost;
    position = applyBuy(state, ticker, quantity, price);
  } else {
    const held = getPosition(state, ticker)?.quantity ?? 0;
    if (quantity > held + EPSILON) {
      throw new EngineError(
        `Insufficient shares: cannot sell ${format(quantity)} ${ticker}, holding ${format(held)}`,
      );
    }
    state.cash_balance += quantity * price;
    position = applySell(state, ticker, quantity);
  }

  const trade: TradeRow = {
    id: newId(),
    ticker,
    side,
    quantity,
    price,
    executed_at: nowIso(),
  };
  state.trades.push(trade);

  const value = totalValue(state, priceOf);
  state.snapshots.push({ total_value: value, recorded_at: nowIso() });

  return {
    trade,
    position: position
      ? {
          ticker: position.ticker,
          quantity: round(position.quantity, QTY),
          avg_cost: round(position.avg_cost, MONEY),
        }
      : null,
    cash_balance: round(state.cash_balance, MONEY),
    total_value: value,
  };
}

/** Format a share count without trailing zeros, like Python's %g. */
function format(value: number): string {
  return String(Number(value.toPrecision(6)));
}

// --- valuation -------------------------------------------------------------

/**
 * Value one position, marking to the cached price.
 *
 * A ticker with no tick yet reports a null current_price and zero P&L rather
 * than valuing the holding at zero.
 */
function valuePosition(row: PositionRow, priceOf: (ticker: string) => number | null) {
  const price = priceOf(row.ticker);
  const mark = price ?? row.avg_cost;
  const costBasis = row.quantity * row.avg_cost;
  const marketValue = row.quantity * mark;
  const pnl = marketValue - costBasis;
  return {
    ticker: row.ticker,
    quantity: round(row.quantity, QTY),
    avg_cost: round(row.avg_cost, MONEY),
    current_price: price === null ? null : round(price, MONEY),
    market_value: round(marketValue, MONEY),
    cost_basis: round(costBasis, MONEY),
    unrealized_pnl: round(pnl, MONEY),
    unrealized_pnl_percent: costBasis ? round((pnl / costBasis) * 100, MONEY) : 0,
  };
}

export function buildPortfolio(state: PortfolioState, priceOf: (t: string) => number | null) {
  const positions = state.positions.map((row) => valuePosition(row, priceOf));
  const positionsValue = positions.reduce((sum, p) => sum + p.market_value, 0);
  const costBasis = positions.reduce((sum, p) => sum + p.cost_basis, 0);
  const pnl = positionsValue - costBasis;
  return {
    cash_balance: round(state.cash_balance, MONEY),
    positions,
    positions_value: round(positionsValue, MONEY),
    total_value: round(state.cash_balance + positionsValue, MONEY),
    unrealized_pnl: round(pnl, MONEY),
    unrealized_pnl_percent: costBasis ? round((pnl / costBasis) * 100, MONEY) : 0,
  };
}

export function totalValue(state: PortfolioState, priceOf: (t: string) => number | null): number {
  return buildPortfolio(state, priceOf).total_value;
}

/**
 * The Tracked Ticker Set: the watchlist plus every ticker with an open position.
 *
 * A held ticker has to stay tracked after leaving the watchlist. Drop it and the
 * position loses its price, and under the no-cached-price rule it could never be
 * sold again.
 */
export function trackedTickers(state: PortfolioState): string[] {
  const tracked = new Set(state.watchlist);
  for (const position of state.positions) tracked.add(position.ticker);
  return [...tracked].sort();
}

/**
 * Watchlist rows with their latest price, in the order the tickers were added.
 *
 * The price fields are all null together until the first tick arrives, rather
 * than some being null and others zero.
 */
export function watchlistView(
  state: PortfolioState,
  getUpdate: (ticker: string) => PriceUpdate | null,
) {
  const held = new Map(state.positions.map((p) => [p.ticker, p.quantity]));
  return state.watchlist.map((ticker) => {
    const update = getUpdate(ticker);
    return {
      ticker,
      price: update ? round(update.price, MONEY) : null,
      previous_price: update ? round(update.previous_price, MONEY) : null,
      change: update ? update.change : null,
      change_percent: update ? update.change_percent : null,
      direction: update ? update.direction : null,
      timestamp: update ? update.timestamp : null,
      position_quantity: held.get(ticker) ?? 0,
    };
  });
}

// --- watchlist -------------------------------------------------------------

const TICKER_PATTERN = /^[A-Z]{1,5}$/;

/** Uppercase and format-check. There is no symbol-existence check, as before. */
export function normalizeTicker(ticker: string): string {
  const upper = ticker.trim().toUpperCase();
  if (!TICKER_PATTERN.test(upper)) throw new EngineError(`Invalid ticker: '${upper}'`);
  return upper;
}

export function addWatchlistTicker(state: PortfolioState, ticker: string): string {
  const symbol = normalizeTicker(ticker);
  if (state.watchlist.includes(symbol)) {
    throw new EngineError(`${symbol} is already on the watchlist`);
  }
  state.watchlist.push(symbol);
  return symbol;
}

export function removeWatchlistTicker(state: PortfolioState, ticker: string): string {
  const symbol = normalizeTicker(ticker);
  if (!state.watchlist.includes(symbol)) {
    throw new EngineError(`${symbol} is not on the watchlist`);
  }
  state.watchlist = state.watchlist.filter((t) => t !== symbol);
  return symbol;
}
