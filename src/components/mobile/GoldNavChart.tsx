"use client";

import { useEffect, useId, useMemo, useState } from "react";

export type NavPoint = { date: string; nav: number };

export function useBookNavHistory(liveNav: number): NavPoint[] {
  const [hist, setHist] = useState<NavPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/book/nav-history")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { points?: NavPoint[] } | null) => {
        if (!cancelled) setHist(data?.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setHist([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const points = [...hist];
    if (liveNav > 0) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last.nav - liveNav) > 0.5) {
        points.push({ date: "Live", nav: liveNav });
      } else {
        points[points.length - 1] = { ...last, nav: liveNav };
      }
    }
    return points;
  }, [hist, liveNav]);
}

function compactAxis(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = n / 1_000_000;
    return `${m >= 10 || m <= -10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function shortLabel(raw: string, i: number, len: number): string {
  if (raw === "Live") return "Now";
  if (i === 0 || i === len - 1 || i === Math.floor((len - 1) / 2)) {
    const d = new Date(`${raw}T12:00:00`);
    if (Number.isNaN(d.getTime())) return raw.slice(5);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }
  return "";
}

/**
 * Gold bar + line chart for the iOS dashboard. Plots book NAV, not return.
 */
export function GoldNavChart({
  points,
  className,
}: {
  points: NavPoint[];
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const width = 360;
  const height = 168;
  const padL = 36;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const usable = points.filter((p) => Number.isFinite(p.nav));

  if (usable.length < 2) {
    return (
      <p
        className={
          className
            ? `py-8 text-center text-sm text-muted ${className}`
            : "py-8 text-center text-sm text-muted"
        }
      >
        History builds up night by night.
      </p>
    );
  }

  const vals = usable.map((p) => p.nav);
  const dataMin = Math.min(...vals);
  const dataMax = Math.max(...vals);
  const mid = (dataMin + dataMax) / 2;
  const rawSpan = dataMax - dataMin;
  // Keep a quiet book from looking like a mountain: at least ~4% of NAV.
  const floorSpan = Math.max(Math.abs(mid) * 0.04, 1);
  const span = Math.max(rawSpan, floorSpan);
  const pad = span * 0.12;
  const min = dataMin - pad;
  const max = dataMax + pad;
  const axisSpan = max - min || 1;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const gap = innerW / usable.length;
  const barW = Math.max(6, Math.min(22, gap * 0.55));
  const xAt = (i: number) => padL + gap * i + gap / 2;
  const yAt = (v: number) => padT + (1 - (v - min) / axisSpan) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + axisSpan * t);
  const line = usable
    .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.nav).toFixed(1)}`)
    .join(" ");
  const last = usable[usable.length - 1];
  const lastX = xAt(usable.length - 1);
  const lastY = yAt(last.nav);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className ? `h-auto w-full ${className}` : "h-auto w-full"}
      role="img"
      aria-label="Book value over recent sessions"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F0D7A4" />
          <stop offset="0.55" stopColor="#D6AD69" />
          <stop offset="1" stopColor="#7A5A32" />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={padL}
            x2={width - padR}
            y1={yAt(t)}
            y2={yAt(t)}
            stroke="currentColor"
            strokeOpacity={0.12}
            strokeDasharray="3 4"
          />
          <text
            x={padL - 6}
            y={yAt(t) + 3.5}
            textAnchor="end"
            fill="currentColor"
            opacity={0.4}
            fontSize="11"
          >
            {compactAxis(t)}
          </text>
        </g>
      ))}
      {usable.map((p, i) => {
        const x = xAt(i);
        const y = yAt(p.nav);
        const h = innerH - (y - padT);
        return (
          <rect
            key={`${p.date}-${i}`}
            x={x - barW / 2}
            y={y}
            width={barW}
            height={Math.max(2, h)}
            rx={3}
            fill={`url(#${gid})`}
          />
        );
      })}
      <polyline
        fill="none"
        stroke="#E8C989"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={line}
      />
      <polygon
        points={`${lastX},${lastY - 5} ${lastX + 7},${lastY} ${lastX},${lastY + 5}`}
        fill="#E8C989"
      />
      {usable.map((p, i) => {
        const label = shortLabel(p.date, i, usable.length);
        if (!label) return null;
        return (
          <text
            key={`l-${i}`}
            x={xAt(i)}
            y={height - 6}
            textAnchor="middle"
            fill="currentColor"
            opacity={0.4}
            fontSize="11"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
