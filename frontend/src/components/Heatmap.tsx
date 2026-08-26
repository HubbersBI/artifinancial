"use client";

import { Panel } from "./Panel";
import { treemap } from "@/lib/treemap";
import { money, percent } from "@/lib/format";
import type { Position } from "@/lib/types";

interface HeatmapProps {
  positions: Position[];
  onSelect: (ticker: string) => void;
}

/** Saturates at +/-5%, which is a full day's move for most of the seed set. */
const FULL_SCALE = 5;

/** Rectangles sized by portfolio weight, coloured by unrealized P&L. */
export function Heatmap({ positions, onSelect }: HeatmapProps) {
  const items = positions.map((p) => ({
    key: p.ticker,
    value: marketValue(p),
  }));
  const rects = treemap(items);
  const byTicker = new Map(positions.map((p) => [p.ticker, p]));
  const totalValue = items.reduce((s, i) => s + i.value, 0);

  return (
    <Panel
      label="Allocation"
      tone="submit"
      testId="heatmap-panel"
      datum={rects.length ? `${rects.length} positions` : ""}
      className="min-h-0 flex-1"
    >
      {rects.length === 0 ? (
        <div
          data-testid="heatmap-empty"
          className="flex h-full items-center justify-center px-4 text-center font-sans text-[11px] text-ink-faint"
        >
          No positions yet. Buy something from the trade bar.
        </div>
      ) : (
        <div className="relative h-full w-full">
          {rects.map((r) => {
            const position = byTicker.get(r.key)!;
            const pnlPercent = position.unrealized_pnl_percent ?? 0;
            const weight = totalValue > 0 ? (marketValue(position) / totalValue) * 100 : 0;
            return (
              <button
                key={r.key}
                data-testid={`heatmap-tile-${r.key}`}
                data-weight={weight.toFixed(2)}
                onClick={() => onSelect(r.key)}
                title={`${r.key}  ${money(marketValue(position))}  ${percent(pnlPercent)}`}
                style={{
                  left: `${r.x}%`,
                  top: `${r.y}%`,
                  width: `${r.w}%`,
                  height: `${r.h}%`,
                  backgroundColor: tileColor(pnlPercent),
                }}
                className="absolute flex flex-col items-center justify-center overflow-hidden border border-void/70 leading-tight hover:brightness-125"
              >
                <span className="text-[11px] font-medium text-ink">{r.key}</span>
                <span className="tnum text-[10px] text-ink/85">{percent(pnlPercent)}</span>
              </button>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function marketValue(p: Position): number {
  return p.market_value ?? (p.current_price ?? p.avg_cost) * p.quantity;
}

/** Diverging green/red, neutral slate at flat. */
export function tileColor(pnlPercent: number): string {
  const t = Math.min(Math.abs(pnlPercent) / FULL_SCALE, 1);
  const mix = (12 + t * 58).toFixed(0);
  if (pnlPercent === 0) return "#232c38";
  return pnlPercent > 0
    ? `color-mix(in srgb, #26d07c ${mix}%, #1b2430)`
    : `color-mix(in srgb, #ff5765 ${mix}%, #1b2430)`;
}
