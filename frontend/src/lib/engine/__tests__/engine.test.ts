import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Engine, TICK_MS } from "..";
import { mockResponse } from "../chat";
import { initialState } from "../state";
import { loadState, saveState } from "../storage";

let engine: Engine;

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  engine = new Engine(initialState());
});

afterEach(() => {
  engine.stop();
  vi.useRealTimers();
});

describe("the tick loop", () => {
  it("replaces SSE: subscribers get one payload keyed by ticker", () => {
    const seen: string[] = [];
    engine.subscribe((prices) => seen.push(...Object.keys(prices)));
    engine.start();
    vi.advanceTimersByTime(TICK_MS);
    expect(seen).toContain("AAPL");
    expect(seen).toContain("NVDA");
  });

  it("delivers a snapshot immediately, so a late subscriber sees prices at once", () => {
    const calls: number[] = [];
    engine.subscribe((prices) => calls.push(Object.keys(prices).length));
    expect(calls[0]).toBeGreaterThan(0);
  });

  it("moves prices as it ticks", () => {
    let latest: Record<string, { price: number }> = {};
    engine.subscribe((prices) => {
      latest = prices;
    });
    const first = latest.AAPL.price;
    engine.start();
    vi.advanceTimersByTime(TICK_MS * 50);
    // Over 50 ticks at least something has to have moved off the seed price.
    expect(latest.AAPL.price).not.toBe(first);
  });

  it("stops ticking once stopped", () => {
    let ticks = 0;
    engine.subscribe(() => (ticks += 1));
    engine.start();
    vi.advanceTimersByTime(TICK_MS * 3);
    const afterStart = ticks;
    engine.stop();
    vi.advanceTimersByTime(TICK_MS * 10);
    expect(ticks).toBe(afterStart);
  });

  it("drops a listener when it unsubscribes", () => {
    let ticks = 0;
    const off = engine.subscribe(() => (ticks += 1));
    engine.start();
    vi.advanceTimersByTime(TICK_MS);
    off();
    const before = ticks;
    vi.advanceTimersByTime(TICK_MS * 5);
    expect(ticks).toBe(before);
  });
});

describe("the former REST surface", () => {
  it("returns the seeded watchlist with prices", () => {
    const rows = engine.watchlist();
    expect(rows).toHaveLength(10);
    expect(rows[0].ticker).toBe("AAPL");
    expect(rows[0].price).toBeGreaterThan(0);
  });

  it("starts with all cash and no positions", () => {
    const portfolio = engine.portfolio();
    expect(portfolio.cash_balance).toBe(10000);
    expect(portfolio.positions).toEqual([]);
  });

  it("buys, and the position shows up valued", () => {
    engine.trade("AAPL", 2, "buy");
    const portfolio = engine.portfolio();
    expect(portfolio.positions[0].ticker).toBe("AAPL");
    expect(portfolio.positions[0].quantity).toBe(2);
    expect(portfolio.cash_balance).toBeLessThan(10000);
  });

  it("lists trades newest first", () => {
    engine.trade("AAPL", 1, "buy");
    engine.trade("MSFT", 1, "buy");
    expect(engine.trades().map((t) => t.ticker)).toEqual(["MSFT", "AAPL"]);
  });

  it("adds and removes a watchlist ticker, and tracks its price", () => {
    engine.addTicker("PYPL");
    const added = engine.watchlist().find((r) => r.ticker === "PYPL");
    expect(added).toBeDefined();
    expect(added!.price).toBeGreaterThan(0);

    engine.removeTicker("PYPL");
    expect(engine.watchlist().some((r) => r.ticker === "PYPL")).toBe(false);
  });

  it("keeps pricing a held ticker after it leaves the watchlist", () => {
    engine.trade("AAPL", 1, "buy");
    engine.removeTicker("AAPL");
    engine.start();
    vi.advanceTimersByTime(TICK_MS * 2);
    // Still valued: untracking it would make the position unsellable.
    expect(engine.portfolio().positions[0].current_price).toBeGreaterThan(0);
  });

  it("tracks a ticker bought without being on the watchlist", () => {
    engine.removeTicker("NVDA");
    engine.addTicker("NVDA");
    engine.removeTicker("NVDA");
    expect(() => engine.trade("NVDA", 1, "buy")).toThrow(/No price available/);
  });

  it("records a snapshot for the P&L chart on every fill", () => {
    engine.trade("AAPL", 1, "buy");
    engine.trade("AAPL", 1, "sell");
    expect(engine.history()).toHaveLength(2);
  });
});

describe("the mock assistant", () => {
  it("is labelled as a mock in every reply, so nobody mistakes it for a model", () => {
    expect(mockResponse("hello").message).toContain("Mock assistant");
    expect(mockResponse("buy 5 AAPL").message).toContain("Mock assistant");
  });

  it("reads a buy and executes it", () => {
    const reply = engine.chat("buy 3 AAPL");
    expect(reply.trades[0].status).toBe("executed");
    expect(reply.trades[0].quantity).toBe(3);
    expect(engine.portfolio().positions[0].quantity).toBe(3);
  });

  it("reads a sell", () => {
    engine.trade("AAPL", 5, "buy");
    const reply = engine.chat("sell 2 AAPL");
    expect(reply.trades[0].status).toBe("executed");
    expect(engine.portfolio().positions[0].quantity).toBe(3);
  });

  it("reports a rejected action instead of failing the whole turn", () => {
    const reply = engine.chat("buy 99999 AAPL");
    expect(reply.trades[0].status).toBe("rejected");
    expect(reply.trades[0].error).toMatch(/Insufficient cash/);
    // The turn still produced a message and was recorded.
    expect(reply.message).toContain("Mock assistant");
    expect(engine.chatHistory()).toHaveLength(2);
  });

  it("adds to the watchlist on request", () => {
    engine.removeTicker("NVDA");
    const reply = engine.chat("watch NVDA");
    expect(reply.watchlist_changes[0].status).toBe("executed");
    expect(engine.watchlist().some((r) => r.ticker === "NVDA")).toBe(true);
  });

  it("keeps both sides of the conversation", () => {
    engine.chat("hello");
    const history = engine.chatHistory();
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("rejects an empty message", () => {
    expect(() => engine.chat("   ")).toThrow(/must not be empty/);
  });
});

describe("persistence", () => {
  it("survives a reload", () => {
    engine.trade("AAPL", 4, "buy");
    engine.stop(); // flushes

    const revived = new Engine(loadState());
    expect(revived.portfolio().positions[0].quantity).toBe(4);
    expect(revived.portfolio().cash_balance).toBeLessThan(10000);
    revived.stop();
  });

  it("does not write on every tick", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem");
    engine.start();
    vi.advanceTimersByTime(TICK_MS * 10);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("flushes when the tab goes away, so a last-second trade is not lost", () => {
    engine.start();
    engine.trade("AAPL", 1, "buy");
    // Well inside the debounce window: nothing has been written yet.
    expect(localStorage.getItem("artifinancial:state:v1")).toBeNull();

    window.dispatchEvent(new Event("pagehide"));
    const stored = JSON.parse(localStorage.getItem("artifinancial:state:v1")!);
    expect(stored.positions).toHaveLength(1);
  });

  it("starts fresh rather than crashing on corrupt stored state", () => {
    localStorage.setItem("artifinancial:state:v1", "{not json");
    expect(loadState().cash_balance).toBe(10000);
  });

  it("fills in fields missing from an older stored shape", () => {
    localStorage.setItem("artifinancial:state:v1", JSON.stringify({ cash_balance: 42 }));
    const state = loadState();
    expect(state.cash_balance).toBe(42);
    expect(state.positions).toEqual([]);
    expect(state.watchlist.length).toBeGreaterThan(0);
  });

  it("survives storage being unavailable", () => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(() => saveState(initialState())).not.toThrow();
    } finally {
      Storage.prototype.setItem = setItem;
    }
  });

  it("resets to a fresh portfolio", () => {
    engine.trade("AAPL", 1, "buy");
    engine.reset();
    expect(engine.portfolio().cash_balance).toBe(10000);
    expect(engine.portfolio().positions).toEqual([]);
  });
});
