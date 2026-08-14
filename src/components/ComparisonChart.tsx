"use client";

import { Metric } from "@/components/ui/Panel";
import { cn, percent, signedTone } from "@/lib/format";
import { useMemo, useState } from "react";

export type ComparisonSeries = {
  label: string;
  color: string;
  /** Fractional return series, e.g. 0.05 = +5%, aligned/same length across series. */
  points: number[];
  /** Extra line under the % in the legend, usually a dollar move. */
  hint?: string;
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

function uniqueTicks(rawMin: number, rawMax: number): number[] {
  const raw = [rawMax, 0, rawMin];
  const out: number[] = [];
  for (const v of raw) {
    if (out.some((t) => Math.abs(t - v) < 0.0005)) continue;
    out.push(v);
  }
  return out;
}

/**
 * Multi-line % return chart (Margus vs SPY vs, optionally, a user's sheet).
 * Plots return, not dollars, so different starting capital can share an axis.
 */
export function ComparisonChart({
  series,
  labels,
  width = 640,
  height = 132,
  className,
}: Props) {
  const usable = series.filter((s) => s.points.length >= 2);
  const [hover, setHover] = useState<number | null>(null);

  const len = usable[0]?.points.length ?? 0;
  const padLeft = 42;
  const padRight = 6;
  const padTop = 10;
  const padBottom = 8;

  const xAt = (i: number) =>
    len > 1
      ? padLeft + (i / (len - 1)) * (width - padLeft - padRight)
      : width / 2;

  const geometry = useMemo(() => {
    if (usable.length === 0) return null;
    const allValues = usable.flatMap((s) => s.points);
    const rawMin = Math.min(...allValues, 0);
    const rawMax = Math.max(...allValues, 0);
    const span = rawMax - rawMin || 0.01;
    const pad = Math.max(span * 0.06, 0.001);
    const min = rawMin - pad;
    const max = rawMax + pad;
    const range = max - min || 1;
    const yAt = (v: number) =>
      padTop + (1 - (v - min) / range) * (height - padTop - padBottom);
    const toXY = (points: number[]) =>
      points
        .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
        .join(" ");
    return { min, max, range, toXY, yAt, rawMin, rawMax };
    // xAt closes over len/width; those are the real deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usable, width, height, len]);

  if (usable.length === 0 || !geometry) {
    return (
      <div
        className="flex items-center justify-center text-sm text-zinc-400"
        style={{ height }}
      >
        History builds up day by day. Check back tomorrow.
      </div>
    );
  }

  const { toXY, yAt, rawMin, rawMax } = geometry;
  const active = hover != null && hover >= 0 && hover < len ? hover : null;
  const dayLabel =
    active != null
      ? formatDayLabel(labels?.[active] ?? labels?.[labels.length - 1] ?? "Live")
      : null;
  const startLabel = formatDayLabel(labels?.[0] ?? "");
  const endLabel = formatDayLabel(labels?.[len - 1] ?? "Live");
  const ticks = uniqueTicks(rawMin, rawMax);
  const cols =
    usable.length >= 3 ? "grid-cols-3" : usable.length === 1 ? "grid-cols-1" : "grid-cols-2";

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || len <= 1) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padLeft) / (width - padLeft - padRight);
    return Math.max(0, Math.min(len - 1, Math.round(t * (len - 1))));
  }

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full touch-pan-y"
          role="img"
          aria-label="Return comparison. Hover or drag to read a day."
          onPointerMove={(e) => {
            setHover(indexFromClientX(e.clientX, e.currentTarget));
          }}
          onPointerLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={yAt(t)}
                y2={yAt(t)}
                stroke="currentColor"
                strokeOpacity={t === 0 ? 0.22 : 0.08}
                strokeDasharray={t === 0 ? "4 4" : undefined}
              />
              <text
                x={padLeft - 6}
                y={yAt(t) + 3.5}
                textAnchor="end"
                fill="currentColor"
                opacity={0.45}
                fontSize="11"
              >
                {percent(t)}
              </text>
            </g>
          ))}
          {usable.map((s) => (
            <polyline
              key={s.label}
              fill="none"
              stroke={s.color}
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={toXY(s.points)}
            />
          ))}
          {active != null && (
            <line
              x1={xAt(active)}
              x2={xAt(active)}
              y1={padTop}
              y2={height - padBottom}
              stroke="currentColor"
              strokeOpacity={0.35}
            />
          )}
          {active != null &&
            usable.map((s) => {
              const v = s.points[active] ?? 0;
              return (
                <circle
                  key={s.label}
                  cx={xAt(active)}
                  cy={yAt(v)}
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
      <div className="mt-1 flex justify-between text-xs text-zinc-500">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      <div className={`mt-3 grid gap-2 ${cols}`}>
        {usable.map((s) => {
          const last = s.points[s.points.length - 1] ?? 0;
          return (
            <Metric
              key={s.label}
              label={
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                    aria-hidden
                  />
                  <span className="truncate">{s.label}</span>
                </span>
              }
              hint={
                s.hint ? (
                  <span className={signedTone(last, "text-zinc-500")}>
                    {s.hint}
                  </span>
                ) : undefined
              }
              valueClassName={signedTone(last, "text-zinc-100")}
            >
              {percent(last)}
            </Metric>
          );
        })}
      </div>
    </div>
  );
}
