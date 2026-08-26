"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Panel } from "./Panel";
import { useFlash } from "@/hooks/useFlash";
import { clockTime, money, percent, toneClass } from "@/lib/format";
import type { PriceUpdate, SeriesPoint } from "@/lib/types";

interface MainChartProps {
  ticker: string | null;
  points: SeriesPoint[];
  quote?: PriceUpdate;
}

/**
 * Price for the selected ticker. There is no history API, so this starts empty
 * and fills in from the stream; it resets on reload.
 */
export function MainChart({ ticker, points, quote }: MainChartProps) {
  const flash = useFlash(quote?.price);
  const rising = points.length > 1 && points[points.length - 1].price >= points[0].price;

  return (
    <Panel
      label={ticker ? `Chart / ${ticker}` : "Chart"}
      tone="primary"
      testId="main-chart-panel"
      datum={`${points.length} ticks`}
      className="min-h-0 flex-1"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-baseline gap-3 px-3 pt-2">
          <span data-testid="main-chart-ticker" className="text-[15px] font-medium text-ink">
            {ticker ?? "--"}
          </span>
          <span
            key={flash.nonce}
            data-testid="main-chart-price"
            className={`tnum px-1 text-[22px] font-medium leading-none text-ink ${flash.className}`}
          >
            {quote ? money(quote.price) : "--"}
          </span>
          <span className={`tnum text-[12px] ${toneClass(quote?.change_percent)}`}>
            {quote ? `${percent(quote.change_percent)}` : ""}
          </span>
          <span className="tnum ml-auto text-[10px] text-ink-faint">
            {quote ? clockTime(quote.timestamp) : ""}
          </span>
        </div>

        {points.length < 2 ? (
          <Collecting count={points.length} />
        ) : (
          <div data-testid="main-chart" className="min-h-0 flex-1 px-1 pb-1 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#2a323d" strokeDasharray="2 4" vertical={false} />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t: number) => clockTime(t).slice(3)}
                  stroke="#5c6672"
                  tick={{ fontSize: 9 }}
                  minTickGap={48}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="#5c6672"
                  tick={{ fontSize: 9 }}
                  width={52}
                  tickFormatter={(v: number) => money(v)}
                />
                <Line
                  type="linear"
                  dataKey="price"
                  dot={false}
                  isAnimationActive={false}
                  strokeWidth={1.5}
                  stroke={rising ? "var(--color-up)" : "var(--color-down)"}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Collecting({ count }: { count: number }) {
  return (
    <div
      data-testid="main-chart-collecting"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center"
    >
      <span className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">Collecting data</span>
      <span className="font-sans text-[11px] text-ink-faint">
        {count === 0
          ? "No ticks yet. The chart builds from the live stream."
          : "Waiting for a second tick."}
      </span>
    </div>
  );
}
