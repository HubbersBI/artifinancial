"use client";

import { useState, type FormEvent } from "react";
import { Panel } from "./Panel";
import { Sparkline } from "./Sparkline";
import { useFlash } from "@/hooks/useFlash";
import { money, percent, toneClass } from "@/lib/format";
import type { PriceMap, SeriesPoint } from "@/lib/types";

interface WatchlistProps {
  tickers: string[];
  prices: PriceMap;
  series: Record<string, SeriesPoint[]>;
  selected: string | null;
  onSelect: (ticker: string) => void;
  onAdd: (ticker: string) => Promise<void>;
  onRemove: (ticker: string) => Promise<void>;
  error?: string | null;
}

export function Watchlist({
  tickers,
  prices,
  series,
  selected,
  onSelect,
  onAdd,
  onRemove,
  error,
}: WatchlistProps) {
  const [draft, setDraft] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ticker = draft.trim().toUpperCase();
    if (!ticker) return;
    await onAdd(ticker);
    setDraft("");
  }

  return (
    <Panel
      label="Watchlist"
      tone="accent"
      testId="watchlist-panel"
      className="w-[268px] shrink-0"
      datum={`${tickers.length} symbols`}
      footer={
        <form onSubmit={submit} className="flex items-center gap-1 p-1">
          <input
            data-testid="watchlist-add-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            placeholder="ADD SYMBOL"
            maxLength={5}
            aria-label="Add symbol to watchlist"
            className="min-w-0 flex-1 border border-edge bg-void px-2 py-1 text-[11px] uppercase tracking-wider text-ink placeholder:text-ink-faint"
          />
          <button
            data-testid="watchlist-add-submit"
            type="submit"
            className="border border-submit bg-submit px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-ink hover:brightness-125"
          >
            Add
          </button>
        </form>
      }
    >
      {error ? (
        <p data-testid="watchlist-error" className="px-2 py-1 font-sans text-[11px] text-down">
          {error}
        </p>
      ) : null}
      <div role="list">
        {tickers.map((ticker) => (
          <Row
            key={ticker}
            ticker={ticker}
            price={prices[ticker]?.price}
            changePercent={prices[ticker]?.change_percent}
            points={series[ticker] ?? []}
            selected={ticker === selected}
            onSelect={onSelect}
            onRemove={onRemove}
          />
        ))}
      </div>
    </Panel>
  );
}

interface RowProps {
  ticker: string;
  price?: number;
  changePercent?: number;
  points: SeriesPoint[];
  selected: boolean;
  onSelect: (ticker: string) => void;
  onRemove: (ticker: string) => Promise<void>;
}

function Row({ ticker, price, changePercent, points, selected, onSelect, onRemove }: RowProps) {
  const flash = useFlash(price);
  const waiting = price === undefined;

  return (
    <div
      role="listitem"
      data-testid={`watchlist-row-${ticker}`}
      data-selected={selected}
      onClick={() => onSelect(ticker)}
      className={`group flex h-[26px] cursor-pointer items-center gap-2 border-l-2 px-2 hover:bg-panel-hi ${
        selected ? "border-l-accent bg-panel-hi" : "border-l-transparent"
      }`}
    >
      <span
        data-testid={`watchlist-ticker-${ticker}`}
        className="w-11 shrink-0 text-[11px] font-medium text-ink"
      >
        {ticker}
      </span>

      <Sparkline points={points} testId={`watchlist-sparkline-${ticker}`} />

      {waiting ? (
        <span
          data-testid={`watchlist-price-${ticker}`}
          data-waiting="true"
          className="ml-auto text-[9px] uppercase tracking-wider text-ink-faint"
        >
          waiting for price
        </span>
      ) : (
        <>
          <span
            key={flash.nonce}
            data-testid={`watchlist-price-${ticker}`}
            className={`tnum ml-auto w-[62px] px-1 text-right text-[11px] text-ink ${flash.className}`}
          >
            {money(price)}
          </span>
          <span
            data-testid={`watchlist-change-${ticker}`}
            className={`tnum w-[54px] text-right text-[11px] ${toneClass(changePercent)}`}
          >
            {percent(changePercent)}
          </span>
        </>
      )}

      <button
        data-testid={`watchlist-remove-${ticker}`}
        aria-label={`Remove ${ticker}`}
        onClick={(e) => {
          e.stopPropagation();
          void onRemove(ticker);
        }}
        className="w-3 shrink-0 text-[11px] leading-none text-ink-faint opacity-0 group-hover:opacity-100 hover:text-down focus-visible:opacity-100"
      >
        x
      </button>
    </div>
  );
}
