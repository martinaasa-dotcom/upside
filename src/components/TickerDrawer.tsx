"use client";

import { currency, percent, cn, cashtag } from "@/lib/format";
import { Card, MicroLabel, Pill, Segmented } from "@/components/ui/Panel";
import type { ConvictionEntry, ConvictionLevel } from "@/lib/conviction";
import { estimateGreenStreak } from "@/lib/streaks";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import { getShockProfile } from "@/lib/book-shock";
import {
  FORECAST_YEARS,
  resolveTickerForecastPath,
  type ForecastYear,
} from "@/lib/forecast";
import type { PortfolioEoyOverrides } from "@/lib/forecast-overrides";
import type { CoveredCallRow } from "@/lib/types";
import { Bot, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  1: "Weak, watching for an exit",
  2: "Below average, trimming candidate",
  3: "Neutral, holding as-is",
  4: "Strong, comfortable adding",
  5: "Max, highest-confidence thesis",
};

const THEME_LABELS: Record<string, string> = {
  ai_infra: "AI infrastructure",
  ai_power: "Data centre power",
  crypto: "Crypto",
  space: "Space and defence",
  semi: "Semiconductors",
  fintech: "Fintech",
  software: "Software",
  healthcare: "Healthcare",
  drones: "Autonomous systems",
  index: "Index fund",
  other: "Diversified",
};

const HORIZONS = [
  { id: "3y" as const, label: "3 years", title: "End of 2028" },
  { id: "5y" as const, label: "5 years", title: "End of 2030" },
];

type Props = {
  open: boolean;
  ticker: string | null;
  spot: number | null;
  shares: number | null;
  buyPrice: number | null;
  sparkline?: number[];
  todayChangePct?: number | null;
  conviction?: ConvictionEntry | null;
  overrides?: PortfolioEoyOverrides;
  coveredCallRow?: CoveredCallRow | null;
  onSetEoyPrice?: (ticker: string, year: ForecastYear, price: number) => void;
  onConviction: (level: ConvictionLevel, thesis: string) => void;
  onClose: () => void;
  onAskMargus?: () => void;
};

export function TickerDrawer({
  open,
  ticker,
  spot,
  shares,
  buyPrice,
  sparkline,
  todayChangePct,
  conviction,
  overrides,
  coveredCallRow,
  onSetEoyPrice,
  onConviction,
  onClose,
  onAskMargus,
}: Props) {
  const [horizon, setHorizon] = useState<"3y" | "5y">("3y");
  const [editingYear, setEditingYear] = useState<ForecastYear | null>(null);
  const [yearDraftPrice, setYearDraftPrice] = useState<string>("");
  const [thesisDraft, setThesisDraft] = useState(conviction?.thesis ?? "");

  // Reset when the drawer target changes, not on every remote save, or
  // the textarea fights you mid-sentence.
  useEffect(() => {
    setThesisDraft(conviction?.thesis ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ticker/open only
  }, [ticker, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const liveSpot = spot ?? buyPrice ?? 50;

  // Resolves the exact forecast path matching the Forecast table
  const forecastSummary = useMemo(() => {
    if (!ticker) return null;
    return resolveTickerForecastPath(ticker, liveSpot, overrides);
  }, [ticker, liveSpot, overrides]);

  if (!open || !ticker || !forecastSummary) return null;

  const streak = estimateGreenStreak(sparkline);
  const roi =
    spot != null && buyPrice != null && buyPrice > 0
      ? (spot - buyPrice) / buyPrice
      : null;
  const level = conviction?.level ?? 3;
  const theme = forecastThemeForTicker(ticker);
  const shockProfile = getShockProfile(ticker);

  const targetPrice =
    horizon === "3y"
      ? forecastSummary.threeYearPrice
      : forecastSummary.fiveYearPrice;
  const targetGainPct =
    horizon === "3y"
      ? forecastSummary.threeYearGainPct
      : forecastSummary.fiveYearGainPct;
  const targetCagrPct =
    horizon === "3y"
      ? forecastSummary.threeYearCagrPct
      : forecastSummary.fiveYearCagrPct;
  const targetYear: ForecastYear = horizon === "3y" ? 2028 : 2030;

  function handleYearEditCommit(year: ForecastYear) {
    const parsed = Number.parseFloat(yearDraftPrice.replace(/,/g, "."));
    if (!Number.isNaN(parsed) && parsed > 0 && onSetEoyPrice) {
      onSetEoyPrice(ticker!, year, Math.round(parsed * 100) / 100);
    }
    setEditingYear(null);
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-none flex-col border-l border-zinc-700/80 bg-[#121214] shadow-2xl sm:max-w-md">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight text-white">
                {cashtag(ticker)}
              </h2>
              <Pill tone="neutral">{THEME_LABELS[theme] ?? "Equities"}</Pill>
            </div>
            <p className="mt-1 text-sm text-zinc-400">
              {spot != null ? currency(spot) : "—"}
              {todayChangePct != null && (
                <span
                  className={cn(
                    "ml-1 font-medium tabular-nums",
                    todayChangePct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  ({todayChangePct >= 0 ? "+" : ""}
                  {(todayChangePct * 100).toFixed(1)}%)
                </span>
              )}
              {shares != null ? ` · ${shares.toLocaleString("en-US")} sh` : ""}
              {roi != null ? ` · ${percent(roi)} vs cost` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* Price path — the same numbers as the Forecast table, never a
            * second opinion. */}
          <section className="space-y-3 rounded-2xl border border-brand-deep/30 bg-[#161618]/70 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-white">
                  Price path
                </h3>
                <p className="mt-0.5 text-sm text-zinc-400">
                  A modeled scenario, not a target. Same numbers as Forecast.
                </p>
              </div>
              <Segmented
                options={HORIZONS}
                value={horizon}
                onChange={setHorizon}
                ariaLabel="Forecast horizon"
              />
            </div>

            <Card tone="good">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <MicroLabel>If it plays out by {targetYear}</MicroLabel>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                    {currency(targetPrice, 2)}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    Works out to about{" "}
                    <span className="font-medium tabular-nums text-emerald-300">
                      {targetCagrPct >= 0 ? "+" : ""}
                      {targetCagrPct.toFixed(1)}%
                    </span>{" "}
                    a year
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "text-lg font-semibold tabular-nums",
                      targetGainPct >= 0 ? "text-gain" : "text-loss"
                    )}
                  >
                    {targetGainPct >= 0 ? "+" : ""}
                    {percent(targetGainPct)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    from today&apos;s price
                  </p>
                </div>
              </div>
            </Card>

            <div>
              <MicroLabel className="mb-2">
                Year by year · tap to change
              </MicroLabel>
              <div className="grid grid-cols-5 gap-1.5">
                {FORECAST_YEARS.map((yr) => {
                  const p = forecastSummary.eoyPrices[yr];
                  const g = forecastSummary.eoyGains[yr];
                  const isCurrentHorizon = yr === targetYear;

                  if (editingYear === yr) {
                    return (
                      <div
                        key={yr}
                        className="rounded-lg border border-brand bg-zinc-950 px-1 py-1.5 text-center"
                      >
                        <p className="text-xs font-medium text-brand-bright">
                          &apos;{String(yr).slice(2)}
                        </p>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoFocus
                          value={yearDraftPrice}
                          onChange={(e) => setYearDraftPrice(e.target.value)}
                          onBlur={() => handleYearEditCommit(yr)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleYearEditCommit(yr);
                            if (e.key === "Escape") setEditingYear(null);
                          }}
                          aria-label={`Price at end of ${yr}`}
                          className="mt-0.5 w-full bg-transparent text-center text-xs font-semibold tabular-nums text-white outline-none"
                        />
                      </div>
                    );
                  }

                  return (
                    <button
                      key={yr}
                      type="button"
                      onClick={() => {
                        setEditingYear(yr);
                        setYearDraftPrice(p.toFixed(2));
                      }}
                      title={`Change the end-of-${yr} price`}
                      className={cn(
                        "rounded-lg border px-1 py-2 text-center transition hover:border-zinc-600",
                        isCurrentHorizon
                          ? "border-brand/50 bg-brand/10"
                          : "border-zinc-800 bg-zinc-950/40"
                      )}
                    >
                      <p className="text-xs text-zinc-400">
                        &apos;{String(yr).slice(2)}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold tabular-nums text-zinc-100">
                        ${Math.round(p)}
                      </p>
                      <p
                        className={cn(
                          "text-xs tabular-nums",
                          g >= 0 ? "text-gain" : "text-loss"
                        )}
                      >
                        {g >= 0 ? "+" : ""}
                        {(g * 100).toFixed(0)}%
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="grid gap-2 sm:grid-cols-2">
            <Card>
              <MicroLabel>Recent run</MicroLabel>
              <p className="mt-1 text-sm font-medium text-zinc-200">
                {streak.label}
              </p>
            </Card>
            <Card>
              <MicroLabel>Moves with</MicroLabel>
              <p className="mt-1 truncate text-sm font-medium text-zinc-200">
                {shockProfile.label}
              </p>
            </Card>
          </div>

          {coveredCallRow && coveredCallRow.nextStrike != null && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MicroLabel>Your call plan</MicroLabel>
                {coveredCallRow.yield2w != null && (
                  <span className="text-xs font-medium tabular-nums text-sky-300">
                    {percent(coveredCallRow.yield2w)} for two weeks
                  </span>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-xs text-zinc-400">Strike</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                    {currency(coveredCallRow.nextStrike)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Room above</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-200">
                    {coveredCallRow.targetDistance != null
                      ? percent(coveredCallRow.targetDistance)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-400">Contracts</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-200">
                    {coveredCallRow.contracts}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>How sure are you?</MicroLabel>
              <span className="text-xs font-medium text-amber-300">
                {level} of 5
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="Conviction level"
              className="mt-2.5 flex gap-1.5"
            >
              {([1, 2, 3, 4, 5] as ConvictionLevel[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={level === n}
                  onClick={() => onConviction(n, thesisDraft)}
                  title={CONVICTION_LABELS[n]}
                  className={cn(
                    "touch-target h-10 flex-1 rounded-lg text-sm font-semibold tabular-nums transition",
                    level === n
                      ? "bg-brand/25 text-brand-bright ring-1 ring-brand/50"
                      : "border border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:text-white"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-zinc-300">
              {CONVICTION_LABELS[level]}
            </p>
          </Card>

          <Card>
            <MicroLabel>Why you own it</MicroLabel>
            <textarea
              value={thesisDraft}
              rows={3}
              onChange={(e) => setThesisDraft(e.target.value)}
              onBlur={() => onConviction(level, thesisDraft)}
              placeholder="One or two lines. What has to stay true for you to keep holding?"
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-sm leading-relaxed text-white outline-none placeholder:text-zinc-500 focus:border-brand focus:ring-1 focus:ring-brand/40"
            />
            <p className="mt-1.5 text-xs text-zinc-400">
              Pulse and Forecast read this. Saves when you click away.
            </p>
          </Card>

          {onAskMargus && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAskMargus();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <Bot className="h-4 w-4 text-brand-bright" />
              Ask Margus about {cashtag(ticker)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
