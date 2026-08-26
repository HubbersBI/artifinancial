"use client";

import { useState } from "react";
import { Panel } from "./Panel";
import { clockTime, money, percent, quantity, signedMoney, toneClass } from "@/lib/format";
import type { Position, PriceMap, Trade } from "@/lib/types";

interface PositionsPanelProps {
  positions: Position[];
  prices: PriceMap;
  trades: Trade[];
  onSelect: (ticker: string) => void;
}

type Tab = "positions" | "trades";

export function PositionsPanel({ positions, prices, trades, onSelect }: PositionsPanelProps) {
  const [tab, setTab] = useState<Tab>("positions");

  return (
    <Panel
      label="Book"
      tone="accent"
      testId="positions-panel"
      className="h-full min-h-0"
      datum={
        <span className="flex gap-1">
          <TabButton id="positions" tab={tab} setTab={setTab} label={`Positions ${positions.length}`} />
          <TabButton id="trades" tab={tab} setTab={setTab} label={`Trades ${trades.length}`} />
        </span>
      }
    >
      {tab === "positions" ? (
        <PositionsTable positions={positions} prices={prices} onSelect={onSelect} />
      ) : (
        <TradesTable trades={trades} />
      )}
    </Panel>
  );
}

function TabButton({
  id,
  tab,
  setTab,
  label,
}: {
  id: Tab;
  tab: Tab;
  setTab: (t: Tab) => void;
  label: string;
}) {
  const active = tab === id;
  return (
    <button
      data-testid={`positions-tab-${id}`}
      data-active={active}
      onClick={() => setTab(id)}
      className={`px-2 py-[1px] text-[10px] uppercase tracking-[0.12em] ${
        active ? "bg-edge text-ink" : "text-ink-faint hover:text-ink-dim"
      }`}
    >
      {label}
    </button>
  );
}

const HEAD = "px-2 py-1 text-[9px] font-medium uppercase tracking-[0.12em] text-ink-faint";
const CELL = "tnum px-2 py-1 text-[11px]";

function PositionsTable({ positions, prices, onSelect }: Omit<PositionsPanelProps, "trades">) {
  if (positions.length === 0) {
    return (
      <p data-testid="positions-empty" className="p-3 font-sans text-[11px] text-ink-faint">
        No open positions.
      </p>
    );
  }

  return (
    <table data-testid="positions-table" className="w-full border-collapse">
      <thead className="sticky top-0 bg-panel">
        <tr className="border-b border-edge text-left">
          <th className={HEAD}>Ticker</th>
          <th className={`${HEAD} text-right`}>Qty</th>
          <th className={`${HEAD} text-right`}>Avg cost</th>
          <th className={`${HEAD} text-right`}>Price</th>
          <th className={`${HEAD} text-right`}>Unrealized</th>
          <th className={`${HEAD} text-right`}>Change</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((p) => {
          const price = prices[p.ticker]?.price ?? p.current_price ?? null;
          const pnl =
            price === null ? (p.unrealized_pnl ?? null) : (price - p.avg_cost) * p.quantity;
          const pnlPercent =
            price === null
              ? (p.unrealized_pnl_percent ?? null)
              : ((price - p.avg_cost) / p.avg_cost) * 100;
          return (
            <tr
              key={p.ticker}
              data-testid={`position-row-${p.ticker}`}
              onClick={() => onSelect(p.ticker)}
              className="cursor-pointer border-b border-edge/50 hover:bg-panel-hi"
            >
              <td className={`${CELL} font-medium text-ink`}>{p.ticker}</td>
              <td
                data-testid={`position-qty-${p.ticker}`}
                className={`${CELL} text-right text-ink-dim`}
              >
                {quantity(p.quantity)}
              </td>
              <td
                data-testid={`position-avg-cost-${p.ticker}`}
                className={`${CELL} text-right text-ink-dim`}
              >
                {money(p.avg_cost)}
              </td>
              <td
                data-testid={`position-price-${p.ticker}`}
                className={`${CELL} text-right text-ink`}
              >
                {price === null ? "waiting" : money(price)}
              </td>
              <td
                data-testid={`position-pnl-${p.ticker}`}
                className={`${CELL} text-right ${toneClass(pnl)}`}
              >
                {signedMoney(pnl)}
              </td>
              <td
                data-testid={`position-pnl-percent-${p.ticker}`}
                className={`${CELL} text-right ${toneClass(pnlPercent)}`}
              >
                {percent(pnlPercent)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <p data-testid="trades-empty" className="p-3 font-sans text-[11px] text-ink-faint">
        No trades yet.
      </p>
    );
  }

  return (
    <table data-testid="trades-table" className="w-full border-collapse">
      <thead className="sticky top-0 bg-panel">
        <tr className="border-b border-edge text-left">
          <th className={HEAD}>Time</th>
          <th className={HEAD}>Ticker</th>
          <th className={HEAD}>Side</th>
          <th className={`${HEAD} text-right`}>Qty</th>
          <th className={`${HEAD} text-right`}>Fill</th>
        </tr>
      </thead>
      <tbody>
        {trades.map((t, index) => (
          <tr
            key={t.id ?? `${t.ticker}-${t.executed_at}-${index}`}
            data-testid={`trade-row-${index}`}
            className="border-b border-edge/50"
          >
            <td className={`${CELL} text-ink-faint`}>{clockTime(t.executed_at)}</td>
            <td className={`${CELL} font-medium text-ink`}>{t.ticker}</td>
            <td className={`${CELL} ${t.side === "buy" ? "text-up" : "text-down"}`}>
              {t.side.toUpperCase()}
            </td>
            <td className={`${CELL} text-right text-ink-dim`}>{quantity(t.quantity)}</td>
            <td className={`${CELL} text-right text-ink`}>{money(t.price)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
