"use client";

import { cn, currency, percent, signedCurrency, signedTone } from "@/lib/format";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type NavPoint = { date: string; nav: number };

export type AssumedPosition = { ticker: string; shares: number };

const ASSUMED_PREF_KEY = "portfell-nav-assumed-ytd";
const NAV_CACHE_KEY = "portfell-nav-history-v1";

type NavCacheV1 = {
  v: 1;
  posKey: string;
  assumed: boolean;
  cash: number;
  points: NavPoint[];
  serverAssumed: boolean;
  firstRealDate: string | null;
};

function fingerprintPositions(positions: AssumedPosition[]): string {
  return positions
    .map((p) => `${p.ticker.toUpperCase()}:${p.shares}`)
    .sort()
    .join("|");
}

function readNavCache(): NavCacheV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NAV_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NavCacheV1;
    if (parsed?.v !== 1 || !Array.isArray(parsed.points)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeNavCache(entry: NavCacheV1) {
  try {
    window.localStorage.setItem(NAV_CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
}

function cacheMatches(
  c: NavCacheV1,
  posKey: string,
  assumed: boolean,
  cash: number
): boolean {
  return (
    c.posKey === posKey &&
    c.assumed === assumed &&
    Math.abs(c.cash - cash) < 0.5 &&
    c.points.length >= 2
  );
}

function loadAssumedPref(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ASSUMED_PREF_KEY) === "1";
  } catch {
    return false;
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
  const posKey = fingerprintPositions(input.positions);
  const [hist, setHist] = useState<NavPoint[]>([]);
  const [assumed, setAssumed] = useState(false);
  const [serverAssumed, setServerAssumed] = useState(false);
  const [firstRealDate, setFirstRealDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useLayoutEffect(() => {
    const pref = loadAssumedPref();
    setAssumed(pref);
    const cached = readNavCache();
    if (cached && cacheMatches(cached, posKey, pref, input.cash)) {
      setHist(cached.points);
      setServerAssumed(cached.serverAssumed);
      setFirstRealDate(cached.firstRealDate);
      setLoading(false);
    }
    // First client paint only. Later holding changes go through the fetch effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const painted = readNavCache();
    const havePaint =
      painted != null && cacheMatches(painted, posKey, assumed, input.cash);
    if (!havePaint) setLoading(true);
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
          const next = data?.points ?? [];
          const nextAssumed = Boolean(data?.assumed);
          const nextFirst = data?.firstRealDate ?? null;
          setHist(next);
          setServerAssumed(nextAssumed);
          setFirstRealDate(nextFirst);
          setLoading(false);
          if (next.length >= 2) {
            writeNavCache({
              v: 1,
              posKey,
              assumed,
              cash: input.cash,
              points: next,
              serverAssumed: nextAssumed,
              firstRealDate: nextFirst,
            });
          }
        }
      )
      .catch(() => {
        if (cancelled) return;
        if (!havePaint) {
          setHist([]);
          setServerAssumed(false);
        }
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
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    const whole = Math.abs(m - Math.round(m)) < 0.05;
    return `${sign}${whole ? String(Math.round(m)) : m.toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    const whole = Math.abs(k - Math.round(k)) < 0.05;
    return `${sign}${whole ? String(Math.round(k)) : k.toFixed(1)}K`;
  }
  return `${sign}${Math.round(abs)}`;
}

function niceScale(
  lo: number,
  hi: number,
  target = 5
): { min: number; max: number; ticks: number[] } {
  if (!(hi > lo)) {
    const pad = Math.max(Math.abs(hi) * 0.04, 1);
    lo -= pad;
    hi += pad;
  }
  const span = hi - lo;
  const raw = span / Math.max(target - 1, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  let step =
    err >= 7.5 ? 10 * pow : err >= 3 ? 5 * pow : err >= 1.5 ? 2 * pow : pow;
  let min = Math.floor(lo / step) * step;
  let max = Math.ceil(hi / step) * step;
  let n = Math.round((max - min) / step);
  if (n > 6) {
    step *= 2;
    min = Math.floor(lo / step) * step;
    max = Math.ceil(hi / step) * step;
    n = Math.round((max - min) / step);
  }
  const ticks: number[] = [];
  for (let i = 0; i <= n; i++) ticks.push(min + i * step);
  return { min, max, ticks };
}

function parsePointDate(raw: string): Date | null {
  if (raw === "Live") return new Date();
  const d = new Date(`${raw}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDay(raw: string): string {
  const d = parsePointDate(raw);
  if (!d) return raw === "Live" ? "Now" : raw;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function monthTicks(
  points: { date: string }[]
): { i: number; label: string }[] {
  const out: { i: number; label: string }[] = [];
  let lastMonth = -1;
  points.forEach((p, i) => {
    if (p.date === "Live") return;
    const d = parsePointDate(p.date);
    if (!d) return;
    const m = d.getMonth();
    if (m === lastMonth) return;
    lastMonth = m;
    out.push({
      i,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
    });
  });
  const lastI = points.length - 1;
  if (out.length === 0 || out[out.length - 1]!.i !== lastI) {
    out.push({ i: lastI, label: "Now" });
  } else {
    out[out.length - 1] = { i: lastI, label: "Now" };
  }
  return out;
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
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const width = 640;
  const height = 176;
  const padL = 8;
  const padR = 12;
  const padT = 12;
  const padB = 8;
  const usable = useMemo(
    () => points.filter((p) => Number.isFinite(p.nav)),
    [points]
  );

  useEffect(() => {
    if (!pinned) return;
    function onDoc(e: Event) {
      if (svgRef.current?.contains(e.target as Node)) return;
      setPinned(false);
      setActive(null);
    }
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [pinned]);

  const geometry = useMemo(() => {
    if (usable.length < 2) return null;
    const vals = usable.map((p) => p.nav);
    const dataMin = Math.min(...vals);
    const dataMax = Math.max(...vals);
    const scale = niceScale(dataMin, dataMax, 5);
    const axisSpan = scale.max - scale.min || 1;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const lastIdx = usable.length - 1;
    const xAt = (i: number) =>
      padL + (lastIdx === 0 ? innerW / 2 : (i / lastIdx) * innerW);
    const yAt = (v: number) => padT + (1 - (v - scale.min) / axisSpan) * innerH;
    const line = usable
      .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.nav).toFixed(1)}`)
      .join(" ");
    const area = `${xAt(0).toFixed(1)},${(padT + innerH).toFixed(1)} ${line} ${xAt(lastIdx).toFixed(1)},${(padT + innerH).toFixed(1)}`;
    return { ...scale, innerW, innerH, lastIdx, xAt, yAt, line, area };
  }, [usable]);

  if (!geometry) {
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

  const { ticks, innerW, innerH, lastIdx, xAt, yAt, line, area } = geometry;
  const startNav = usable[0]!.nav;
  const xLabels = monthTicks(usable);
  const hover =
    active != null && active >= 0 && active <= lastIdx ? active : null;
  const hoverPoint = hover != null ? usable[hover] : null;
  const ytdRoi =
    hoverPoint && startNav > 0
      ? (hoverPoint.nav - startNav) / startNav
      : null;
  const ytdDollar =
    hoverPoint && startNav > 0 ? hoverPoint.nav - startNav : null;

  function indexFromClientX(clientX: number, target: SVGSVGElement) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || lastIdx <= 0) return 0;
    const x = ((clientX - rect.left) / rect.width) * width;
    const t = (x - padL) / innerW;
    return Math.max(0, Math.min(lastIdx, Math.round(t * lastIdx)));
  }

  function onPointerDown(e: PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(indexFromClientX(e.clientX, e.currentTarget));
    if (e.pointerType !== "mouse") setPinned(true);
  }

  function onPointerMove(e: PointerEvent<SVGSVGElement>) {
    const dragging = e.currentTarget.hasPointerCapture(e.pointerId);
    if (e.pointerType === "mouse" || dragging) {
      setActive(indexFromClientX(e.clientX, e.currentTarget));
    }
  }

  function onPointerLeave(e: PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) return;
    if (!pinned) setActive(null);
  }

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setPinned(true);
    setActive((prev) => {
      const cur = prev ?? lastIdx;
      return e.key === "ArrowLeft"
        ? Math.max(0, cur - 1)
        : Math.min(lastIdx, cur + 1);
    });
  }

  const xMarks = xLabels
    .map((tick) => ({
      ...tick,
      left: ((xAt(tick.i) - padL) / innerW) * 100,
    }))
    .reduce<{ i: number; label: string; left: number }[]>((kept, tick) => {
      const prev = kept[kept.length - 1];
      if (prev && tick.left - prev.left < 8) {
        if (tick.label === "Now") {
          kept.pop();
          kept.push(tick);
        }
        return kept;
      }
      kept.push(tick);
      return kept;
    }, []);

  return (
    <div className={className}>
      <div className="mb-2 flex min-h-[4.75rem] items-center justify-center pl-11">
        {hoverPoint ? (
          <div className="rounded-lg border border-white/10 bg-zinc-950/90 px-2.5 py-1.5 text-center">
            <p className="text-xs text-zinc-400">{formatDay(hoverPoint.date)}</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
              {currency(hoverPoint.nav, 0)}
            </p>
            {ytdRoi != null && ytdDollar != null && (
              <p
                className={cn(
                  "mt-0.5 text-xs tabular-nums",
                  signedTone(ytdRoi)
                )}
              >
                YTD {ytdRoi > 0 ? "+" : ""}
                {percent(ytdRoi)}
                <span className="text-zinc-500">
                  {" "}
                  · {signedCurrency(ytdDollar, 0)}
                </span>
              </p>
            )}
          </div>
        ) : (
          <p className="pb-1 text-xs text-zinc-500">
            Drag across to read a day
          </p>
        )}
      </div>

      <div className="flex items-stretch gap-3">
          <div className="relative w-11 shrink-0">
            {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-0 -translate-y-1/2 text-xs tabular-nums text-zinc-500"
                  style={{
                    top: `${(yAt(t) / height) * 100}%`,
                  }}
                >
                  {compactAxis(t)}
                </span>
              ))}
          </div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="h-auto min-w-0 flex-1 cursor-crosshair touch-none select-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50"
            role="slider"
            tabIndex={0}
            aria-label="Book value over the year. Drag or use arrow keys to read a day."
            aria-valuemin={0}
            aria-valuemax={lastIdx}
            aria-valuenow={hover ?? lastIdx}
            aria-valuetext={
              hoverPoint
                ? `${formatDay(hoverPoint.date)}, ${currency(hoverPoint.nav, 0)}${
                    ytdRoi != null
                      ? `, YTD ${percent(ytdRoi)}`
                      : ""
                  }`
                : undefined
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onKeyDown={onKeyDown}
          >
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#D6AD69" stopOpacity="0.28" />
                <stop offset="1" stopColor="#D6AD69" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <line
                key={t}
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
            {hover != null && hoverPoint && (
              <g pointerEvents="none">
                <line
                  x1={xAt(hover)}
                  x2={xAt(hover)}
                  y1={padT}
                  y2={padT + innerH}
                  stroke="#E8C989"
                  strokeOpacity={0.45}
                />
                <circle
                  cx={xAt(hover)}
                  cy={yAt(hoverPoint.nav)}
                  r={4.5}
                  fill="#E8C989"
                  stroke="#08090C"
                  strokeWidth={1.5}
                />
              </g>
            )}
          </svg>
      </div>
      <div className="mt-1.5 flex">
        <div className="w-11 shrink-0" />
        <div className="relative h-4 min-w-0 flex-1">
          {xMarks.map((tick, i) => {
            const isFirst = i === 0;
            const isLast = i === xMarks.length - 1;
            return (
              <span
                key={`${tick.i}-${tick.label}`}
                className="absolute top-0 text-xs text-zinc-500"
                style={{
                  left: `${tick.left}%`,
                  transform: isFirst
                    ? "translateX(0)"
                    : isLast
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
                }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
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
          Working out this year’s path …
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
