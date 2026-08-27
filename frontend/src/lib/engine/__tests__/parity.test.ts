/**
 * The port pinned to the Python it came from.
 *
 * The reference values below were computed by the formula in
 * backend/app/market/simulator.py for AAPL (mu 0.05, sigma 0.22, S 190.00). Two
 * implementations of one market only stay honest if both are held to the same
 * numbers; if this drifts, the browser build and the container are simulating
 * different worlds.
 */
import { describe, expect, it } from "vitest";
import { GBMSimulator, DEFAULT_DT } from "../simulator";
import type { Rng } from "../random";

const fixed = (z: number): Rng => ({ next: () => 1, normal: () => z });

// Computed by the Python simulator's own formula for AAPL (mu 0.05, sigma 0.22).
const PYTHON: Array<[number, number]> = [
  [1.0, 190.012172557272],
  [-1.0, 189.987829053771],
  [2.5, 190.030432231837],
  [0.0, 190.000000415649],
];

describe("parity with backend/app/market/simulator.py", () => {
  it("matches dt exactly", () => {
    expect(DEFAULT_DT).toBeCloseTo(8.479175145842e-8, 18);
  });

  for (const [z, expected] of PYTHON) {
    it(`matches the Python price to 10 decimals for Z=${z}`, () => {
      const m = new GBMSimulator(["AAPL"], { rng: fixed(z), eventProbability: 0 });
      m.step();
      expect(m.getPrice("AAPL")!).toBeCloseTo(expected, 10);
    });
  }
});
