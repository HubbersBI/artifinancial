/**
 * The whole backend, in the browser.
 *
 * Replaces FastAPI, SQLite, the SSE stream and the LLM call with one object.
 * That is possible because none of it was ever shared or real: the prices come
 * from a generator, the $10,000 is virtual, and nothing a visitor does is
 * visible to anyone else. A server was hosting a private sandbox per person,
 * which is exactly what a browser already is.
 *
 * The tick loop replaces SSE. Subscribers get the same payload the stream sent -
 * one object keyed by ticker - so the components upstream never learn that the
 * network is gone.
 */

import type { PriceUpdate } from "@/lib/types";

import { PriceCache } from "./cache";
import { mockResponse } from "./chat";
import { DEFAULT_TICKERS } from "./seed";
import { GBMSimulator } from "./simulator";
import {
  EngineError,
  addWatchlistTicker,
  buildPortfolio,
  executeTrade,
  getPosition,
  initialState,
  normalizeTicker,
  removeWatchlistTicker,
  round,
  trackedTickers,
  watchlistView,
  type PortfolioState,
  type TradeRow,
} from "./state";
import { loadState, saveState } from "./storage";

/** Matches the backend's SSE cadence, so the UI animates exactly as before. */
export const TICK_MS = 500;
/** Writes are batched: 500ms ticks would otherwise hit localStorage twice a second. */
const SAVE_MS = 2000;

type Listener = (prices: Record<string, PriceUpdate>) => void;

export class Engine {
  private state: PortfolioState;
  private cache = new PriceCache();
  private simulator: GBMSimulator;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private unloadBound: (() => void) | null = null;

  constructor(state?: PortfolioState) {
    this.state = state ?? loadState();
    // The Tracked Ticker Set, not just the watchlist: a held ticker must keep
    // its price or it could never be sold.
    const tracked = trackedTickers(this.state);
    this.simulator = new GBMSimulator(tracked.length ? tracked : [...DEFAULT_TICKERS]);
    this.seedCache();
  }

  // --- lifecycle ---

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);

    // Writes are debounced, so without this a trade made a second before the tab
    // closes is simply lost. pagehide rather than beforeunload: beforeunload is
    // unreliable on mobile, and visibilitychange covers the tab being switched
    // away from and never returned to.
    if (typeof window !== "undefined" && !this.unloadBound) {
      this.unloadBound = () => this.flush();
      window.addEventListener("pagehide", this.unloadBound);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") this.flush();
      });
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.unloadBound && typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.unloadBound);
      this.unloadBound = null;
    }
    this.flush();
  }

  /** Subscribe to price ticks. Returns the unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Deliver the current snapshot immediately, so a late subscriber is not
    // staring at an empty grid until the next tick.
    listener(this.cache.getAll());
    return () => this.listeners.delete(listener);
  }

  private tick(): void {
    const prices = this.simulator.step();
    for (const [ticker, price] of Object.entries(prices)) {
      this.cache.update(ticker, price);
    }
    const snapshot = this.cache.getAll();
    for (const listener of this.listeners) listener(snapshot);
  }

  private seedCache(): void {
    for (const ticker of this.simulator.getTickers()) {
      const price = this.simulator.getPrice(ticker);
      if (price !== null) this.cache.update(ticker, price);
    }
  }

  private priceOf = (ticker: string): number | null => this.cache.getPrice(ticker);

  /** Batch persistence: a trade schedules a write, it does not perform one. */
  private touch(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      saveState(this.state);
    }, SAVE_MS);
  }

  private flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    saveState(this.state);
  }

  // --- the former REST surface ---

  watchlist() {
    return watchlistView(this.state, (ticker) => this.cache.get(ticker));
  }

  addTicker(ticker: string) {
    const symbol = addWatchlistTicker(this.state, ticker);
    this.simulator.addTicker(symbol);
    const price = this.simulator.getPrice(symbol);
    if (price !== null) this.cache.update(symbol, price);
    this.touch();
    return { ticker: symbol };
  }

  removeTicker(ticker: string) {
    const symbol = removeWatchlistTicker(this.state, ticker);
    // Only untrack it if nothing is held: evicting the price of an open position
    // would strand it at a stale value and make it unsellable.
    if (getPosition(this.state, symbol) === null) {
      this.simulator.removeTicker(symbol);
      this.cache.remove(symbol);
    }
    this.touch();
    return { ticker: symbol, removed: true };
  }

  portfolio() {
    return buildPortfolio(this.state, this.priceOf);
  }

  history() {
    return this.state.snapshots.slice(-500);
  }

  trade(ticker: string, quantity: number, side: "buy" | "sell") {
    const result = executeTrade(this.state, this.priceOf, ticker, side, quantity);
    // A ticker can be bought without being on the watchlist; it still has to be
    // tracked from here on, or the position loses its price.
    this.simulator.addTicker(result.trade.ticker);
    this.touch();
    return result;
  }

  trades(limit = 50): TradeRow[] {
    return [...this.state.trades].reverse().slice(0, limit);
  }

  chatHistory(limit = 50) {
    return this.state.chat.slice(-limit);
  }

  /**
   * One chat turn, executing whatever the reply asks for.
   *
   * Mirrors ChatService.handle: each action is attempted, and a rejection is
   * reported against that action rather than failing the whole turn.
   */
  chat(message: string) {
    const trimmed = message.trim();
    if (!trimmed) throw new EngineError("Message must not be empty");

    this.state.chat.push({
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    });

    const reply = mockResponse(trimmed);
    const trades = reply.trades.map((request) => this.runTrade(request));
    const changes = reply.watchlist_changes.map((change) => this.runChange(change));

    const assistant = {
      id: crypto.randomUUID(),
      role: "assistant" as const,
      content: reply.message,
      actions: { trades, watchlist_changes: changes },
      created_at: new Date().toISOString(),
    };
    this.state.chat.push(assistant);
    this.touch();

    return {
      message: reply.message,
      trades,
      watchlist_changes: changes,
      created_at: assistant.created_at,
    };
  }

  private runTrade(request: { ticker: string; side: "buy" | "sell"; quantity: number }) {
    try {
      const result = this.trade(request.ticker, request.quantity, request.side);
      return {
        type: "trade",
        ticker: result.trade.ticker,
        side: result.trade.side,
        quantity: result.trade.quantity,
        price: round(result.trade.price, 2),
        status: "executed",
        error: null,
      };
    } catch (error) {
      return {
        type: "trade",
        ticker: request.ticker,
        side: request.side,
        quantity: request.quantity,
        price: null,
        status: "rejected",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private runChange(change: { ticker: string; action: "add" | "remove" }) {
    try {
      if (change.action === "add") this.addTicker(change.ticker);
      else this.removeTicker(change.ticker);
      return { type: "watchlist", ticker: change.ticker, action: change.action, status: "executed", error: null };
    } catch (error) {
      return {
        type: "watchlist",
        ticker: change.ticker,
        action: change.action,
        status: "rejected",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Start over: used by the demo notice's reset, and by tests. */
  reset(): void {
    this.state = initialState();
    this.cache = new PriceCache();
    this.simulator = new GBMSimulator([...DEFAULT_TICKERS]);
    this.seedCache();
    this.flush();
  }
}

export { EngineError, normalizeTicker };

/**
 * The one engine the page uses.
 *
 * Created lazily so importing this module during SSR or a test does not start a
 * timer or touch localStorage - neither exists at build time.
 */
let engine: Engine | null = null;

export function getEngine(): Engine {
  if (!engine) {
    engine = new Engine();
    engine.start();
  }
  return engine;
}
