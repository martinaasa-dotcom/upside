"use client";

import { useEffect, useId, useMemo, useState } from "react";

export type NavPoint = { date: string; nav: number };

export type AssumedPosition = { ticker: string; shares: number };

const ASSUMED_PREF_KEY = "portfell-nav-assumed-ytd";

function loadAssumedPref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ASSUMED_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

function saveAssumedPref(on: boolean) {
  try {
    localStorage.setItem(ASSUMED_PREF_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function useBookNavHistory(input: {
  liveNav: number;
  cash: number;
  positions: AssumedPosition[];
}): {
  points: NavPoint[];
  assumed: boolean;
  firstRealDate: string | null;
  loading: boolean;
  discardAssumed: () => void;
  restoreAssumed: () => void;
} {
  const [hist, setHist] = useState<NavPoint[]>([]);
  const [assumed, setAssumed] = useState(true);
  const [serverAssumed, setServerAssumed] = useState(false);
  const [firstRealDate, setFirstRealDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setAssumed(loadAssumedPref());
  }, []);

  const posKey = input.positions
    .map((p) => `${p.ticker.toUpperCase()}:${p.shares}`)
    .sort()
    .join("|");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const body = assumed
      ? {
          assumed: true,
          cash: input.cash,
          positions: input.positions,
        }
      : { assumed: false };
    void fetch("/api/book/nav-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            points?: NavPoint[];
            assumed?: boolean;
            firstRealDate?: string | null;
          } | null
        ) => {
          if (cancelled) return;
          setHist(data?.points ?? []);
          setServerAssumed(Boolean(data?.assumed));
          setFirstRealDate(data?.firstRealDate ?? null);
          setLoading(false);
        }
      )
      .catch(() => {
        if (cancelled) return;
        setHist([]);
        setServerAssumed(false);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- posKey fingerprints holdings
  }, [assumed, posKey, input.cash]);

  const points = useMemo(() => {
    const next = [...hist];
    if (input.liveNav > 0) {
      const last = next[next.length - 1];
      if (!last || Math.abs(last.nav - input.liveNav) > 0.5) {
        next.push({ date: "Live", nav: input.liveNav });
      } else {
        next[next.length - 1] = { ...last, nav: input.liveNav };
      }
    }
    return next;
  }, [hist, input.liveNav]);

  return {
    points,
    assumed: assumed && serverAssumed,
    firstRealDate,
    loading,
    discardAssumed: () => {
      saveAssumedPref(false);
      setAssumed(false);
      setServerAssumed(false);
      setHist([]);
      setLoading(true);
    },
    restoreAssumed: () => {
      saveAssumedPref(true);
      setAssumed(true);
    },
  };
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
 * Book NAV as a gold line, same language as Forecast's path chart.
 * Axis copy lives in HTML so it stays text-xs instead of scaling with the SVG.
 */
export function GoldNavChart({
  points,
  className,
}: {
  points: NavPoint[];
  className?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const width = 640;
  const height = 168;
  const padL = 8;
  const padR = 10;
  const padT = 10;
  const padB = 10;
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
  const floorSpan = Math.max(Math.abs(mid) * 0.04, 1);
  const span = Math.max(rawSpan, floorSpan);
  const pad = span * 0.1;
  const min = dataMin - pad;
  const max = dataMax + pad;
  const axisSpan = max - min || 1;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const lastIdx = usable.length - 1;
  const xAt = (i: number) =>
    padL + (lastIdx === 0 ? innerW / 2 : (i / lastIdx) * innerW);
  const yAt = (v: number) => padT + (1 - (v - min) / axisSpan) * innerH;
  const ticks = [dataMax, mid, dataMin];
  const line = usable
    .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.nav).toFixed(1)}`)
    .join(" ");
  const area = `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xAt(lastIdx).toFixed(1)},${(padT + innerH).toFixed(1)}`;
  const last = usable[lastIdx]!;
  const startLabel = shortLabel(usable[0]!.date, 0, usable.length) || usable[0]!.date;
  const midLabel = shortLabel(
    usable[Math.floor(lastIdx / 2)]!.date,
    Math.floor(lastIdx / 2),
    usable.length
  );
  const endLabel = "Now";

  return (
    <div className={className}>
      <div className="flex gap-3">
        <div className="flex w-10 shrink-0 flex-col justify-between py-1 text-right text-xs tabular-nums text-zinc-500">
          {ticks.map((t, i) => (
            <span key={i}>{compactAxis(t)}</span>
          ))}
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto min-w-0 flex-1"
          role="img"
          aria-label="Book value over the year"
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#D6AD69" stopOpacity="0.28" />
              <stop offset="1" stopColor="#D6AD69" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={padL}
              x2={width - padR}
              y1={yAt(t)}
              y2={yAt(t)}
              stroke="currentColor"
              strokeOpacity={0.1}
            />
          ))}
          <polygon points={area} fill={`url(#${gid})`} />
          <polyline
            fill="none"
            stroke="#D6AD69"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            points={line}
          />
          <circle
            cx={xAt(lastIdx)}
            cy={yAt(last.nav)}
            r={4}
            fill="#E8C989"
          />
        </svg>
      </div>
      <div className="mt-1.5 flex justify-between pl-[3.25rem] text-xs text-zinc-500">
        <span>{startLabel}</span>
        {midLabel ? <span>{midLabel}</span> : <span />}
        <span>{endLabel}</span>
      </div>
    </div>
  );
}

export function BookNavChart({
  points,
  assumed,
  loading,
  firstRealDate,
  onDiscardAssumed,
  onRestoreAssumed,
  className,
}: {
  points: NavPoint[];
  assumed: boolean;
  loading?: boolean;
  firstRealDate?: string | null;
  onDiscardAssumed?: () => void;
  onRestoreAssumed?: () => void;
  className?: string;
}) {
  const usable = points.filter((p) => Number.isFinite(p.nav));
  const hasChart = usable.length >= 2;
  const recorded =
    firstRealDate &&
    (() => {
      const d = new Date(`${firstRealDate}T12:00:00`);
      if (Number.isNaN(d.getTime())) return firstRealDate;
      return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      });
    })();

  return (
    <div className={className}>
      {loading && !hasChart ? (
        <p className="py-8 text-center text-sm text-muted">
          Working out this year's path …
        </p>
      ) : (
        <GoldNavChart points={points} />
      )}
      {assumed && hasChart && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="text-xs text-zinc-400">
            Drawn as if you held the same names all year. Not your actual
            buys and sells.
          </p>
          {onDiscardAssumed && (
            <button
              type="button"
              onClick={onDiscardAssumed}
              className="shrink-0 text-xs font-medium text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
            >
              {recorded
                ? `Start from ${recorded}`
                : "Drop assumed path"}
            </button>
          )}
        </div>
      )}
      {!assumed && !loading && onRestoreAssumed && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onRestoreAssumed}
            className="text-xs font-medium text-zinc-400 underline-offset-2 hover:text-zinc-200 hover:underline"
          >
            Fill in an assumed year
          </button>
        </div>
      )}
    </div>
  );
}
