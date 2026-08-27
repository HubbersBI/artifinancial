/**
 * The PLAN section 8 trade rules, in the browser.
 *
 * Deliberately mirrors backend/tests/portfolio/. Two implementations of one
 * rulebook only stay honest if both are held to the same cases: if a test here
 * has no twin there, one of them has drifted.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
  EngineError,
  addWatchlistTicker,
  buildPortfolio,
  executeTrade,
  getPosition,
  initialState,
  normalizeTicker,
  removeWatchlistTicker,
  trackedTickers,
  watchlistView,
  type PortfolioState,
} from "../state";

let state: PortfolioState;
const PRICES: Record<string, number> = { AAPL: 100, MSFT: 200, NVDA: 50 };
const priced = (ticker: string) => PRICES[ticker] ?? null;
const nothing = () => null;

beforeEach(() => {
  state = initialState();
});

describe("buying", () => {
  it("fills at the cached price", () => {
    const result = executeTrade(state, priced, "AAPL", "buy", 10);
    expect(result.trade.price).toBe(100);
    expect(result.position).toEqual({ ticker: "AAPL", quantity: 10, avg_cost: 100 });
    expect(result.cash_balance).toBe(9000);
  });

  it("normalizes a lowercase ticker and side", () => {
    const result = executeTrade(state, priced, " aapl ", " BUY ", 1);
    expect(result.trade.ticker).toBe("AAPL");
    expect(result.trade.side).toBe("buy");
  });

  it("appends a trade and a snapshot", () => {
    executeTrade(state, priced, "AAPL", "buy", 1);
    expect(state.trades).toHaveLength(1);
    expect(state.snapshots).toHaveLength(1);
    // Bought at the mark, so the portfolio is worth what it was.
    expect(state.snapshots[0].total_value).toBe(10000);
  });

  it("allows a fractional quantity", () => {
    const result = executeTrade(state, priced, "AAPL", "buy", 0.5);
    expect(result.position!.quantity).toBe(0.5);
    expect(result.cash_balance).toBe(9950);
  });

  it("weights the average cost across repeat buys", () => {
    const prices: Record<string, number> = { AAPL: 100 };
    const at = (t: string) => prices[t] ?? null;
    executeTrade(state, at, "AAPL", "buy", 10); // 10 @ 100
    prices.AAPL = 200;
    const result = executeTrade(state, at, "AAPL", "buy", 10); // 10 @ 200
    // (10*100 + 10*200) / 20 = 150
    expect(result.position).toEqual({ ticker: "AAPL", quantity: 20, avg_cost: 150 });
  });

  it("allows spending the entire balance", () => {
    const result = executeTrade(state, priced, "AAPL", "buy", 100); // 100 * 100 = 10000
    expect(result.cash_balance).toBe(0);
  });

  it("reports the shortfall when cash is insufficient", () => {
    expect(() => executeTrade(state, priced, "AAPL", "buy", 101)).toThrow(/Insufficient cash/);
    try {
      executeTrade(state, priced, "AAPL", "buy", 101);
    } catch (error) {
      expect((error as Error).message).toContain("short $100.00");
    }
  });
});

describe("selling", () => {
  beforeEach(() => {
    executeTrade(state, priced, "AAPL", "buy", 10);
  });

  it("leaves avg_cost alone", () => {
    const prices: Record<string, number> = { AAPL: 500 };
    const result = executeTrade(state, (t) => prices[t] ?? null, "AAPL", "sell", 5);
    expect(result.position!.avg_cost).toBe(100);
    expect(result.position!.quantity).toBe(5);
  });

  it("deletes the position at zero quantity rather than storing a zero row", () => {
    const result = executeTrade(state, priced, "AAPL", "sell", 10);
    expect(result.position).toBeNull();
    expect(getPosition(state, "AAPL")).toBeNull();
    expect(state.positions).toHaveLength(0);
  });

  it("credits the lower price when selling at a loss", () => {
    const result = executeTrade(state, (t) => (t === "AAPL" ? 40 : null), "AAPL", "sell", 10);
    // 9000 cash left after the buy, plus 10 * 40
    expect(result.cash_balance).toBe(9400);
  });

  it("rejects selling more than is held", () => {
    expect(() => executeTrade(state, priced, "AAPL", "sell", 11)).toThrow(/Insufficient shares/);
  });

  it("rejects selling with no position, because there is no shorting", () => {
    expect(() => executeTrade(state, priced, "MSFT", "sell", 1)).toThrow(/Insufficient shares/);
  });
});

describe("rejections", () => {
  it("rejects a ticker with no cached price", () => {
    expect(() => executeTrade(state, nothing, "AAPL", "buy", 1)).toThrow(/No price available/);
  });

  it.each([0, -1, -0.5])("rejects a non-positive quantity: %s", (quantity) => {
    expect(() => executeTrade(state, priced, "AAPL", "buy", quantity)).toThrow(
      /Quantity must be greater than 0/,
    );
  });

  it("rejects an unknown side", () => {
    expect(() => executeTrade(state, priced, "AAPL", "hold", 1)).toThrow(/Side must be/);
  });

  it("writes nothing when a trade is rejected", () => {
    const before = JSON.stringify(state);
    expect(() => executeTrade(state, priced, "AAPL", "buy", 1e6)).toThrow(EngineError);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe("valuation", () => {
  it("values an empty portfolio as all cash", () => {
    const portfolio = buildPortfolio(state, priced);
    expect(portfolio.cash_balance).toBe(10000);
    expect(portfolio.total_value).toBe(10000);
    expect(portfolio.positions).toEqual([]);
    expect(portfolio.unrealized_pnl_percent).toBe(0);
  });

  it("marks a position to the cached price", () => {
    executeTrade(state, priced, "AAPL", "buy", 10);
    const portfolio = buildPortfolio(state, (t) => (t === "AAPL" ? 150 : null));
    const position = portfolio.positions[0];
    expect(position.current_price).toBe(150);
    expect(position.market_value).toBe(1500);
    expect(position.unrealized_pnl).toBe(500);
    expect(position.unrealized_pnl_percent).toBe(50);
    expect(portfolio.total_value).toBe(10500);
  });

  it("falls back to cost, not zero, for a position with no price", () => {
    executeTrade(state, priced, "AAPL", "buy", 10);
    const portfolio = buildPortfolio(state, nothing);
    const position = portfolio.positions[0];
    expect(position.current_price).toBeNull();
    expect(position.market_value).toBe(1000);
    expect(position.unrealized_pnl).toBe(0);
  });
});

describe("the tracked ticker set", () => {
  it("is the watchlist plus every held ticker", () => {
    state.watchlist = ["AAPL", "MSFT"];
    executeTrade(state, priced, "NVDA", "buy", 1);
    expect(trackedTickers(state)).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("has no duplicates when a held ticker is also on the watchlist", () => {
    state.watchlist = ["AAPL"];
    executeTrade(state, priced, "AAPL", "buy", 1);
    expect(trackedTickers(state)).toEqual(["AAPL"]);
  });

  it("keeps a held ticker tracked after it leaves the watchlist", () => {
    state.watchlist = ["AAPL"];
    executeTrade(state, priced, "AAPL", "buy", 1);
    removeWatchlistTicker(state, "AAPL");
    // Untrack it and the position loses its price and can never be sold.
    expect(trackedTickers(state)).toContain("AAPL");
  });
});

describe("the watchlist", () => {
  it("adds a ticker", () => {
    state.watchlist = [];
    expect(addWatchlistTicker(state, "aapl")).toBe("AAPL");
    expect(state.watchlist).toEqual(["AAPL"]);
  });

  it("rejects a duplicate", () => {
    expect(() => addWatchlistTicker(state, "AAPL")).toThrow(/already on the watchlist/);
  });

  it.each(["", "TOOLONG", "12", "A B", "AA-PL"])("rejects a malformed ticker: '%s'", (bad) => {
    expect(() => normalizeTicker(bad)).toThrow(/Invalid ticker/);
  });

  it("rejects removing one that is not listed", () => {
    expect(() => removeWatchlistTicker(state, "ZZ")).toThrow(/not on the watchlist/);
  });

  it("preserves insertion order rather than sorting", () => {
    state.watchlist = [];
    addWatchlistTicker(state, "MSFT");
    addWatchlistTicker(state, "AAPL");
    expect(watchlistView(state, () => null).map((r) => r.ticker)).toEqual(["MSFT", "AAPL"]);
  });

  it("carries prices and holdings, and nulls them together before the first tick", () => {
    state.watchlist = ["AAPL"];
    executeTrade(state, priced, "AAPL", "buy", 3);
    const [unpriced] = watchlistView(state, () => null);
    expect(unpriced.price).toBeNull();
    expect(unpriced.change).toBeNull();
    expect(unpriced.direction).toBeNull();
    expect(unpriced.position_quantity).toBe(3);

    const [row] = watchlistView(state, () => ({
      ticker: "AAPL",
      price: 120,
      previous_price: 100,
      timestamp: 1,
      change: 20,
      change_percent: 20,
      direction: "up" as const,
    }));
    expect(row.price).toBe(120);
    expect(row.direction).toBe("up");
    expect(row.position_quantity).toBe(3);
  });
});
