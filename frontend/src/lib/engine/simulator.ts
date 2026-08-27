/**
 * GBM market simulator, ported from backend/app/market/simulator.py.
 *
 * Math, unchanged from the Python:
 *
 *   S(t+dt) = S(t) * exp((mu - sigma^2/2) * dt + sigma * sqrt(dt) * Z)
 *
 * with Z a correlated standard normal. The tiny dt (~8.5e-8 for 500ms ticks
 * over 252 trading days of 6.5 hours) gives sub-cent moves per tick that
 * accumulate into a believable chart over minutes.
 *
 * The prices were never real. They came from this generator running on the
 * server and being pushed over SSE, which is the only reason a server was
 * needed to watch them move - so the generator moves into the browser and the
 * server stops being needed.
 */

import { applyLower, cholesky } from "./cholesky";
import { browserRng, type Rng } from "./random";
import {
  CORRELATION_GROUPS,
  CROSS_GROUP_CORR,
  DEFAULT_PARAMS,
  INTRA_FINANCE_CORR,
  INTRA_TECH_CORR,
  SEED_PRICES,
  TICKER_PARAMS,
  TSLA_CORR,
  type TickerParams,
} from "./seed";

/** 252 trading days * 6.5 hours * 3600 seconds. */
export const TRADING_SECONDS_PER_YEAR = 252 * 6.5 * 3600;
/** 500ms as a fraction of a trading year, ~8.48e-8. */
export const DEFAULT_DT = 0.5 / TRADING_SECONDS_PER_YEAR;

export interface SimulatorOptions {
  dt?: number;
  /** Per-ticker chance of a shock on any given tick. */
  eventProbability?: number;
  rng?: Rng;
}

export class GBMSimulator {
  private readonly dt: number;
  private readonly eventProbability: number;
  private readonly rng: Rng;

  private tickers: string[] = [];
  private prices = new Map<string, number>();
  private params = new Map<string, TickerParams>();
  private lower: number[][] | null = null;

  constructor(tickers: string[], options: SimulatorOptions = {}) {
    this.dt = options.dt ?? DEFAULT_DT;
    this.eventProbability = options.eventProbability ?? 0.001;
    this.rng = options.rng ?? browserRng();

    for (const ticker of tickers) this.addInternal(ticker);
    this.rebuild();
  }

  /** Advance every ticker one step. The hot path, called twice a second. */
  step(): Record<string, number> {
    const n = this.tickers.length;
    if (n === 0) return {};

    const independent = Array.from({ length: n }, () => this.rng.normal());
    const correlated = this.lower ? applyLower(this.lower, independent) : independent;

    const result: Record<string, number> = {};
    this.tickers.forEach((ticker, i) => {
      const { mu, sigma } = this.params.get(ticker)!;
      const drift = (mu - 0.5 * sigma * sigma) * this.dt;
      const diffusion = sigma * Math.sqrt(this.dt) * correlated[i];
      let price = this.prices.get(ticker)! * Math.exp(drift + diffusion);

      // Roughly every 50 seconds across ten tickers at two ticks a second.
      if (this.rng.next() < this.eventProbability) {
        const magnitude = 0.02 + this.rng.next() * 0.03;
        const sign = this.rng.next() < 0.5 ? -1 : 1;
        price *= 1 + magnitude * sign;
      }

      this.prices.set(ticker, price);
      result[ticker] = round2(price);
    });
    return result;
  }

  addTicker(ticker: string): void {
    if (this.prices.has(ticker)) return;
    this.addInternal(ticker);
    this.rebuild();
  }

  removeTicker(ticker: string): void {
    if (!this.prices.has(ticker)) return;
    this.tickers = this.tickers.filter((t) => t !== ticker);
    this.prices.delete(ticker);
    this.params.delete(ticker);
    this.rebuild();
  }

  /** Unrounded, matching the Python's get_price. The cache rounds to cents; if
   *  this rounded too, error would compound a little on every read. */
  getPrice(ticker: string): number | null {
    const price = this.prices.get(ticker);
    return price === undefined ? null : price;
  }

  getTickers(): string[] {
    return [...this.tickers];
  }

  private addInternal(ticker: string): void {
    if (this.prices.has(ticker)) return;
    this.tickers.push(ticker);
    // An unknown ticker starts somewhere plausible rather than at zero.
    this.prices.set(ticker, SEED_PRICES[ticker] ?? 50 + this.rng.next() * 250);
    this.params.set(ticker, TICKER_PARAMS[ticker] ?? { ...DEFAULT_PARAMS });
  }

  private rebuild(): void {
    const n = this.tickers.length;
    if (n <= 1) {
      this.lower = null;
      return;
    }
    const corr: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        i === j ? 1 : pairwiseCorrelation(this.tickers[i], this.tickers[j]),
      ),
    );
    this.lower = cholesky(corr);
  }
}

/**
 * Correlation between two tickers, by sector.
 *
 *   same tech      0.6
 *   same finance   0.5
 *   TSLA with any  0.3
 *   cross-sector   0.3
 *   unknown        0.3
 */
export function pairwiseCorrelation(a: string, b: string): number {
  if (a === "TSLA" || b === "TSLA") return TSLA_CORR;
  const tech = CORRELATION_GROUPS.tech;
  const finance = CORRELATION_GROUPS.finance;
  if (tech.has(a) && tech.has(b)) return INTRA_TECH_CORR;
  if (finance.has(a) && finance.has(b)) return INTRA_FINANCE_CORR;
  return CROSS_GROUP_CORR;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
