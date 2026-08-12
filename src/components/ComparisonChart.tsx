"use client";

import { percent } from "@/lib/format";

export type ComparisonSeries = {
  label: string;
  color: string;
  /** Fractional return series, e.g. 0.05 = +5%, aligned/same length across series. */
  points: number[];
};

type Props = {
  series: ComparisonSeries[];
  width?: number;
  height?: number;
  className?: string;
};

/**
 * Small multi-line % return comparison chart (Margus vs SPY vs, optionally,
 * a user's own sheet). Deliberately plots RETURN (fractional, zero-based)
 * rather than raw dollar value so series with different starting capital
 * are directly comparable on one axis.
 */
export function ComparisonChart({ series, width = 640, height = 160, className }: Props) {
  const usable = series.filter((s) => s.points.length >= 2);
  if (usable.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-zinc-500"
        style={{ height }}
      >
        History builds up day by day — check back tomorrow.
      </div>
    );
  }

  const allValues = usable.flatMap((s) => s.points);
  const rawMin = Math.min(...allValues, 0);
  const rawMax = Math.max(...allValues, 0);
  const pad = Math.max((rawMax - rawMin) * 0.12, 0.01);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = max - min || 1;

  const padX = 4;
  const toXY = (points: number[]) =>
    points
      .map((v, i) => {
        const x =
          points.length > 1
            ? (i / (points.length - 1)) * (width - padX * 2) + padX
            : width / 2;
        const y = height - 4 - ((v - min) / range) * (height - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const zeroY = height - 4 - ((0 - min) / range) * (height - 8);

  return (
    <div className={className}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line
          x1={0}
          x2={width}
          y1={zeroY}
          y2={zeroY}
          stroke="currentColor"
          strokeOpacity={0.15}
          strokeDasharray="4 4"
        />
        {usable.map((s) => (
          <polyline
            key={s.label}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={toXY(s.points)}
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {usable.map((s) => {
          const last = s.points[s.points.length - 1] ?? 0;
          return (
            <div key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-zinc-400">{s.label}</span>
              <span
                className={`font-semibold tabular-nums ${last >= 0 ? "text-gain" : "text-loss"}`}
              >
                {percent(last)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
