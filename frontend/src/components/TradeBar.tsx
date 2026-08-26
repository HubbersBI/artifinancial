"use client";

import { useState } from "react";
import { money } from "@/lib/format";
import type { PriceMap } from "@/lib/types";

interface TradeBarProps {
  /** Owned by the terminal so selecting a watchlist row fills the ticket. */
  ticker: string;
  onTickerChange: (ticker: string) => void;
  prices: PriceMap;
  onTrade: (ticker: string, quantity: number, side: "buy" | "sell") => Promise<void>;
  error?: string | null;
  status?: string | null;
}

/** Market orders only: instant fill at the streamed price, no confirmation. */
export function TradeBar({
  ticker: symbol,
  onTickerChange,
  prices,
  onTrade,
  error,
  status,
}: TradeBarProps) {
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const price = prices[symbol.toUpperCase()]?.price;
  const parsedQty = Number(qty);
  const estimate = price !== undefined && parsedQty > 0 ? price * parsedQty : null;

  async function submit(side: "buy" | "sell") {
    setBusy(true);
    await onTrade(symbol.toUpperCase(), parsedQty, side);
    setBusy(false);
  }

  return (
    <div
      data-testid="trade-bar"
      className="flex h-[42px] shrink-0 items-center gap-2 border border-edge bg-rail px-2"
    >
      <span className="text-[10px] uppercase tracking-[0.14em] text-ink-faint">Order</span>

      <input
        data-testid="trade-ticker-input"
        aria-label="Ticker"
        value={symbol}
        maxLength={5}
        onChange={(e) => onTickerChange(e.target.value.toUpperCase())}
        placeholder="TICKER"
        className="w-[78px] border border-edge bg-void px-2 py-1 text-[12px] uppercase tracking-wider text-ink placeholder:text-ink-faint"
      />
      <input
        data-testid="trade-quantity-input"
        aria-label="Quantity"
        value={qty}
        inputMode="decimal"
        onChange={(e) => setQty(e.target.value)}
        placeholder="QTY"
        className="tnum w-[70px] border border-edge bg-void px-2 py-1 text-right text-[12px] text-ink placeholder:text-ink-faint"
      />

      <button
        data-testid="trade-buy-button"
        disabled={busy}
        onClick={() => submit("buy")}
        className="border border-up/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-up hover:bg-up/15 disabled:opacity-40"
      >
        Buy
      </button>
      <button
        data-testid="trade-sell-button"
        disabled={busy}
        onClick={() => submit("sell")}
        className="border border-down/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-down hover:bg-down/15 disabled:opacity-40"
      >
        Sell
      </button>

      <span className="tnum text-[10px] text-ink-faint">
        {price === undefined
          ? symbol
            ? "waiting for price"
            : ""
          : `last ${money(price)}${estimate ? `  est ${money(estimate)}` : ""}`}
      </span>

      {error ? (
        <span data-testid="trade-error" className="ml-auto font-sans text-[11px] text-down">
          {error}
        </span>
      ) : status ? (
        <span data-testid="trade-status" className="ml-auto font-sans text-[11px] text-up">
          {status}
        </span>
      ) : null}
    </div>
  );
}
