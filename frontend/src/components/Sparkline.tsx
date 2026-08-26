import type { SeriesPoint } from "@/lib/types";

interface SparklineProps {
  points: SeriesPoint[];
  width?: number;
  height?: number;
  testId?: string;
}

/**
 * Inline SVG polyline. Points accumulate from the SSE stream since page load,
 * so a fresh ticker shows a dash until it has two of them.
 */
export function Sparkline({ points, width = 60, height = 18, testId }: SparklineProps) {
  if (points.length < 2) {
    return (
      <span
        data-testid={testId}
        data-state="collecting"
        className="inline-block text-[9px] text-ink-faint"
        style={{ width, height }}
      >
        ...
      </span>
    );
  }

  const values = points.map((p) => p.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const path = values
    .map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(" ");
  const rising = values[values.length - 1] >= values[0];

  return (
    <svg
      data-testid={testId}
      data-state="live"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={path}
        fill="none"
        strokeWidth={1}
        stroke={rising ? "var(--color-up)" : "var(--color-down)"}
      />
    </svg>
  );
}
