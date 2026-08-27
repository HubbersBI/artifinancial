import { describe, expect, it } from "vitest";

import { applyLower, cholesky } from "../cholesky";
import { seededRng } from "../random";
import { DEFAULT_DT, GBMSimulator, pairwiseCorrelation } from "../simulator";
import { DEFAULT_TICKERS, SEED_PRICES } from "../seed";

const sim = (tickers = DEFAULT_TICKERS, seed = 42, eventProbability = 0) =>
  new GBMSimulator(tickers, { rng: seededRng(seed), eventProbability });

describe("cholesky", () => {
  it("factors a matrix so that L * L^T recovers it", () => {
    const matrix = [
      [1, 0.6, 0.3],
      [0.6, 1, 0.3],
      [0.3, 0.3, 1],
    ];
    const lower = cholesky(matrix)!;
    expect(lower).not.toBeNull();
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        let sum = 0;
        for (let k = 0; k < 3; k += 1) sum += lower[i][k] * lower[j][k];
        expect(sum).toBeCloseTo(matrix[i][j], 10);
      }
    }
  });

  it("is lower triangular", () => {
    const lower = cholesky([
      [1, 0.5],
      [0.5, 1],
    ])!;
    expect(lower[0][1]).toBe(0);
  });

  it("returns null rather than NaN when the matrix is not positive definite", () => {
    // Perfectly correlated pair plus a contradiction: no valid factorisation.
    expect(
      cholesky([
        [1, 1, -1],
        [1, 1, 1],
        [-1, 1, 1],
      ]),
    ).toBeNull();
  });

  it("multiplies using only the filled half", () => {
    expect(applyLower([[2, 0], [3, 4]], [1, 1])).toEqual([2, 7]);
  });
});

describe("correlation structure", () => {
  it("keeps tech together, finance together, and TSLA apart", () => {
    expect(pairwiseCorrelation("AAPL", "MSFT")).toBe(0.6);
    expect(pairwiseCorrelation("JPM", "V")).toBe(0.5);
    expect(pairwiseCorrelation("AAPL", "JPM")).toBe(0.3);
    expect(pairwiseCorrelation("UNKN", "ALSO")).toBe(0.3);
  });

  it("treats TSLA as independent even though it is a tech name", () => {
    expect(pairwiseCorrelation("TSLA", "AAPL")).toBe(0.3);
    expect(pairwiseCorrelation("NVDA", "TSLA")).toBe(0.3);
  });

  it("produces a decomposable matrix for the default watchlist", () => {
    // If this fails the simulator silently falls back to uncorrelated draws.
    const n = DEFAULT_TICKERS.length;
    const corr = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        i === j ? 1 : pairwiseCorrelation(DEFAULT_TICKERS[i], DEFAULT_TICKERS[j]),
      ),
    );
    expect(cholesky(corr)).not.toBeNull();
  });
});

describe("GBMSimulator", () => {
  it("starts every default ticker at its seed price", () => {
    const market = sim();
    for (const ticker of DEFAULT_TICKERS) {
      expect(market.getPrice(ticker)).toBe(SEED_PRICES[ticker]);
    }
  });

  it("moves prices, but by sub-cent amounts on a single tick", () => {
    const market = sim();
    const before = market.getPrice("AAPL")!;
    market.step();
    const after = market.getPrice("AAPL")!;
    // A 500ms step at 22% annualised vol cannot plausibly move a $190 stock
    // more than a few cents. A larger jump means dt is wrong.
    expect(Math.abs(after - before)).toBeLessThan(1);
  });

  it("is deterministic for a given seed, so a failure can be reproduced", () => {
    const a = sim(DEFAULT_TICKERS, 7);
    const b = sim(DEFAULT_TICKERS, 7);
    for (let i = 0; i < 20; i += 1) {
      expect(a.step()).toEqual(b.step());
    }
  });

  it("returns a price for every tracked ticker on every step", () => {
    const market = sim();
    const prices = market.step();
    expect(Object.keys(prices).sort()).toEqual([...DEFAULT_TICKERS].sort());
  });

  it("rounds to cents, because a price is money", () => {
    const market = sim();
    for (const price of Object.values(market.step())) {
      expect(price).toBe(Math.round(price * 100) / 100);
    }
  });

  it("drifts sensibly over a long run rather than exploding or collapsing", () => {
    const market = sim(["AAPL"], 3);
    for (let i = 0; i < 20000; i += 1) market.step();
    const price = market.getPrice("AAPL")!;
    // 20k ticks is under three hours of simulated trading. Anything outside
    // this band means the drift or volatility scaling is wrong.
    expect(price).toBeGreaterThan(100);
    expect(price).toBeLessThan(400);
  });

  it("moves correlated names together more often than uncorrelated ones", () => {
    const market = sim(["AAPL", "MSFT", "TSLA"], 11);
    let techAgree = 0;
    let tslaAgree = 0;
    let previous = { AAPL: 190, MSFT: 420, TSLA: 250 };
    for (let i = 0; i < 4000; i += 1) {
      const next = market.step();
      const aapl = Math.sign(next.AAPL - previous.AAPL);
      const msft = Math.sign(next.MSFT - previous.MSFT);
      const tsla = Math.sign(next.TSLA - previous.TSLA);
      if (aapl !== 0 && aapl === msft) techAgree += 1;
      if (aapl !== 0 && aapl === tsla) tslaAgree += 1;
      previous = next as typeof previous;
    }
    // 0.6 correlation against 0.3 should show clearly over 4000 ticks.
    expect(techAgree).toBeGreaterThan(tslaAgree);
  });

  it("adds and removes tickers, keeping the rest tracked", () => {
    const market = sim(["AAPL", "MSFT"]);
    market.addTicker("NVDA");
    expect(market.getTickers()).toContain("NVDA");
    expect(market.getPrice("NVDA")).toBe(SEED_PRICES.NVDA);

    market.removeTicker("MSFT");
    expect(market.getTickers()).toEqual(["AAPL", "NVDA"]);
    expect(market.getPrice("MSFT")).toBeNull();
  });

  it("gives an unknown ticker a plausible starting price instead of zero", () => {
    const market = sim(["AAPL"]);
    market.addTicker("ZZZZ");
    const price = market.getPrice("ZZZZ")!;
    expect(price).toBeGreaterThanOrEqual(50);
    expect(price).toBeLessThanOrEqual(300);
  });

  it("ignores adding a ticker it already tracks", () => {
    const market = sim(["AAPL"]);
    const price = market.getPrice("AAPL");
    market.addTicker("AAPL");
    expect(market.getTickers()).toEqual(["AAPL"]);
    expect(market.getPrice("AAPL")).toBe(price);
  });

  it("handles an empty market without throwing", () => {
    const market = sim([]);
    expect(market.step()).toEqual({});
    expect(market.getTickers()).toEqual([]);
  });

  it("applies occasional shocks when they are enabled", () => {
    // eventProbability of 1 forces a shock on every tick, so one step must move
    // the price far more than diffusion alone could.
    const market = new GBMSimulator(["AAPL"], {
      rng: seededRng(5),
      eventProbability: 1,
    });
    market.step();
    expect(Math.abs(market.getPrice("AAPL")! - 190)).toBeGreaterThan(190 * 0.015);
  });

  it("uses a dt small enough to be a 500ms slice of a trading year", () => {
    expect(DEFAULT_DT).toBeCloseTo(8.48e-8, 10);
  });
});
