"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "./Panel";
import { clockTime, money, signedMoney } from "@/lib/format";
import type { PortfolioSnapshot } from "@/lib/types";

interface PnlChartProps {
  snapshots: PortfolioSnapshot[];
}

/** The one chart backed by persisted data, so it survives a reload. */
export function PnlChart({ snapshots }: PnlChartProps) {
  const data = snapshots.map((s) => ({
    t: clockTime(s.recorded_at),
    value: s.total_value,
  }));
  const first = data[0]?.value;
  const last = data[data.length - 1]?.value;
  const delta = first !== undefined && last !== undefined ? last - first : null;
  const rising = (delta ?? 0) >= 0;

  return (
    <Panel
      label="Portfolio value"
      tone="primary"
      testId="pnl-panel"
      datum={delta === null ? "" : signedMoney(delta)}
      className="h-full min-h-0"
    >
      <div className="flex h-full flex-col">
        {data.length < 2 ? (
          <div
            data-testid="pnl-empty"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 text-center"
          >
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-dim">
              Collecting data
            </span>
            <span className="font-sans text-[11px] text-ink-faint">
              Snapshots are recorded every 30 seconds and after each trade.
            </span>
          </div>
        ) : (
          <div data-testid="pnl-chart" className="min-h-0 flex-1 px-1 py-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="pnl-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={
                        rising ? "var(--color-up)" : "var(--color-down)"
                      }
                      stopOpacity={0.28}
                    />
                    <stop
                      offset="100%"
                      stopColor={
                        rising ? "var(--color-up)" : "var(--color-down)"
                      }
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="#2a323d"
                  strokeDasharray="2 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="t"
                  stroke="#5c6672"
                  tick={{ fontSize: 9 }}
                  minTickGap={48}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="#5c6672"
                  tick={{ fontSize: 9 }}
                  width={52}
                  tickFormatter={(v: number) => money(v, 0)}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                  stroke={rising ? "var(--color-up)" : "var(--color-down)"}
                  fill="url(#pnl-fill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Panel>
  );
}
