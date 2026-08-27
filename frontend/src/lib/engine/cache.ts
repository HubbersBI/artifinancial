/**
 * Latest price per ticker, ported from backend/app/market/cache.py.
 *
 * No lock here: the browser is single-threaded, so the Python's mutex has no
 * counterpart and its absence is not an oversight.
 *
 * Rounding lives here rather than in the simulator, exactly as it does in the
 * Python. The simulator keeps full precision internally so error does not
 * compound tick over tick; what reaches the screen is money, so it is cents.
 */

import type { Direction, PriceUpdate } from "@/lib/types";

const MONEY = 2;

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function direction(price: number, previous: number): Direction {
  if (price > previous) return "up";
  if (price < previous) return "down";
  return "flat";
}

export class PriceCache {
  private prices = new Map<string, PriceUpdate>();

  /**
   * Record a price, deriving change and direction from the one before it.
   *
   * The first update for a ticker has previous_price equal to price, so it
   * reads as 'flat' rather than as a jump up from zero.
   */
  update(ticker: string, price: number, timestamp?: number): PriceUpdate {
    const existing = this.prices.get(ticker);
    const previous = existing ? existing.price : price;
    const rounded = round(price, MONEY);
    const roundedPrevious = round(previous, MONEY);

    const entry: PriceUpdate = {
      ticker,
      price: rounded,
      previous_price: roundedPrevious,
      timestamp: timestamp ?? Date.now() / 1000,
      change: round(rounded - roundedPrevious, 4),
      change_percent:
        roundedPrevious === 0 ? 0 : round(((rounded - roundedPrevious) / roundedPrevious) * 100, 4),
      direction: direction(rounded, roundedPrevious),
    };
    this.prices.set(ticker, entry);
    return entry;
  }

  get(ticker: string): PriceUpdate | null {
    return this.prices.get(ticker) ?? null;
  }

  getPrice(ticker: string): number | null {
    return this.prices.get(ticker)?.price ?? null;
  }

  getAll(): Record<string, PriceUpdate> {
    return Object.fromEntries(this.prices);
  }

  remove(ticker: string): void {
    this.prices.delete(ticker);
  }

  has(ticker: string): boolean {
    return this.prices.has(ticker);
  }

  get size(): number {
    return this.prices.size;
  }
}
