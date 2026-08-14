"use client";

import { percent } from "@/lib/format";
import { useMemo, useState } from "react";

export type ComparisonSeries = {
  label: string;
  color: string;
  /** Fractional return series, e.g. 0.05 = +5%, aligned/same length across series. */
  points: number[];
};

type Props = {
  series: ComparisonSeries[];
  /** Same length as each series. Shown on hover so you can read the exact day. */
  labels?: string[];
  width?: number;
  height?: number;
  className?: string;
};

function formatDayLabel(raw: string) {
  if (!raw || raw === "Live") return "Live";
  const iso = raw.length <= 10 ? `${raw}T12:00:00` : raw;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * Small multi-line % return comparison chart (Margus vs SPY vs, optionally,
 * a user's own sheet). Deliberately plots RETURN (fractional, zero-based)
 * rather than raw dollar value so series with different starting capital
 * are directly comparable on one axis.
 */
export function ComparisonChart({
  series,
  labels,
  width = 640,
  height = 160,
  className,
}: Props) {
  const usable = series.filter((s) => s.points.length >= 2);
  const [hover, setHover] = useState<number | null>(null);

  const len = usable[0]?.points.length ?? 0;
  const padX = 4;

  const xAt = (i: number) =>
    len > 1 ? (i / (len - 1)) * (width - padX * 2) + padX : width / 2;

  const geometry = useMemo(() => {
    if (usable.length === 0) return null;
    const allValues = usable.flatMap((s) => s.points);
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 0);
    const pad = Math.max((rawMax - rawMin) * 0.12, 0.01);
    const min = rawMin - pad;
    const max = rawMax + pad;
    const range = max - min || 1;
    const toXY = (points: number[]) =>
      points
        .map((v, i) => {
          const x = xAt(i);
          const y = height - 4 - ((v - min) / range) * (height - 8);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    const zeroY = height - 4 - ((0 - min) / range) * (height - 8);
    return { min, range, toXY, zeroY };
    // xAt closes over len/width; those are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable, width, height, len]);

  if (usable.length === 0 || !geometry) {
    return (
      <div
        className="flex items-center justify-center text-xs text-zinc-400"
        style={{ height }}
      >
        History builds up day by day. Check back tomorrow.
      </div>
    );
  }

  const { toXY, zeroY, min, range } = geometry;
  const active = hover != null && hover >= 0 && hover < len ? hover : null;
  const dayLabel =
    active != null
      ? formatDayLabel(labels?.[active] ?? labels?.[labels.length - 1] ?? "Live")
      : null;

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || len <= 1) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padX) / (width - padX * 2);
    return Math.max(0, Math.min(len - 1, Math.round(t * (len - 1))));
  }

  return (
    <div className={className ? `min-w-0 max-w-full ${className}` : "min-w-0 max-w-full"}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full touch-pan-y"
          onPointerMove={(e) => {
            setHover(indexFromClientX(e.clientX, e.currentTarget));
          }}
          onPointerLeave={() => setHover(null)}
        >
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
          {active != null && (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={4}
              y2={height - 4}
              stroke="currentColor"
              strokeOpacity={0.35}
            />
          )}
          {active != null &&
            usable.map((s) => {
              const v = s.points[active] ?? 0;
              const y = height - 4 - ((v - min) / range) * (height - 8);
              return (
                <circle
                  key={s.label}
                  cx={xAt(active)}
                  cy={y}
                  r={3.5}
                  fill={s.color}
                />
              );
            })}
        </svg>
        {active != null && dayLabel && (
          <div className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-md border border-zinc-700 bg-zinc-950/95 px-2 py-1 text-xs shadow-lg">
            <p className="text-center font-medium text-zinc-200">{dayLabel}</p>
            <div className="mt-0.5 flex flex-wrap justify-center gap-x-3">
              {usable.map((s) => {
                const v = s.points[active] ?? 0;
                return (
                  <span key={s.label} className="tabular-nums text-zinc-300">
                    <span style={{ color: s.color }}>{s.label}</span>{" "}
                    <span className={v >= 0 ? "text-gain" : "text-loss"}>
                      {percent(v)}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
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
      <p className="mt-1 text-xs text-zinc-500">
        Hover or drag for the exact day.
      </p>
    </div>
  );
}
