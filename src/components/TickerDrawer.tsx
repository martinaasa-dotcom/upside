"use client";

import { currency, percent, cn, cashtag } from "@/lib/format";
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
import {
  Bot,
  Calculator,
  Layers,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  1: "Weak, watching for an exit",
  2: "Below average, trimming candidate",
  3: "Neutral, holding as-is",
  4: "Strong, comfortable adding",
  5: "Max, highest-confidence thesis",
};

const THEME_LABELS: Record<string, string> = {
  ai_infra: "AI Infrastructure & GPU Cloud",
  ai_power: "AI Data Center Power & Grid",
  crypto: "Digital Assets & Crypto Treasury",
  space: "Space Infrastructure & Defense",
  semi: "Semiconductors & Compute",
  fintech: "Fintech & Payments",
  software: "Enterprise Software & Cloud",
  healthcare: "Healthcare & Biotech",
  drones: "Autonomous Systems & Defense",
  index: "Broad Market Index",
  other: "Diversified Equities",
};

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
  const [showValuation, setShowValuation] = useState(false);
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

  // Valuation sandbox slider state (initialized from the forecast's 3-year CAGR)
  const [customCagr, setCustomCagr] = useState<number>(() => {
    return forecastSummary ? Math.round(forecastSummary.threeYearCagrPct) : 25;
  });

  // Keep custom CAGR aligned when switching tickers
  useEffect(() => {
    if (forecastSummary) {
      setCustomCagr(
        Math.max(
          5,
          Math.min(
            80,
            Math.round(
              horizon === "3y"
                ? forecastSummary.threeYearCagrPct
                : forecastSummary.fiveYearCagrPct
            )
          )
        )
      );
    }
  }, [forecastSummary, horizon]);

  if (!open || !ticker || !forecastSummary) return null;

  const streak = estimateGreenStreak(sparkline);
  const roi =
    spot != null && buyPrice != null && buyPrice > 0
      ? (spot - buyPrice) / buyPrice
      : null;
  const level = conviction?.level ?? 3;
  const thesis = thesisDraft;
  const theme = forecastThemeForTicker(ticker);
  const shockProfile = getShockProfile(ticker);

  // Active target based on selected horizon
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
  const targetYearLabel = horizon === "3y" ? "EOY 2028 (3Y)" : "EOY 2030 (5Y)";

  // Custom sandbox modeled price
  const yearsOut = horizon === "3y" ? 3 : 5;
  const customModeledPrice =
    Math.round(liveSpot * Math.pow(1 + customCagr / 100, yearsOut) * 100) / 100;
  const customGainPct =
    liveSpot > 0 ? (customModeledPrice - liveSpot) / liveSpot : 0;

  function commitCustomTarget() {
    if (!onSetEoyPrice) return;
    const yearToSet: ForecastYear = horizon === "3y" ? 2028 : 2030;
    onSetEoyPrice(ticker!, yearToSet, customModeledPrice);
    setShowValuation(false);
  }

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
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3.5 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">{cashtag(ticker)}</h3>
              <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                {THEME_LABELS[theme] ?? "Equities"}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">
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
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="space-y-4 overflow-y-auto px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex-1">
          {/* Forecast Path & Trajectory Model (Synchronized with Forecast Table) */}
          <div className="rounded-xl border border-brand-deep/30 bg-[#161618]/90 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand/20 text-brand-bright">
                  <Calculator className="h-3 w-3" />
                </span>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                  Forecast Trajectory Model
                </p>
              </div>

              {/* 3Y vs 5Y Horizon Switcher */}
              <div className="flex rounded-lg border border-zinc-800 bg-zinc-900/60 p-0.5">
                <button
                  type="button"
                  onClick={() => setHorizon("3y")}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium transition",
                    horizon === "3y"
                      ? "bg-brand/25 text-brand-bright font-semibold shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  3-Year (2028)
                </button>
                <button
                  type="button"
                  onClick={() => setHorizon("5y")}
                  className={cn(
                    "rounded px-2 py-0.5 text-[11px] font-medium transition",
                    horizon === "5y"
                      ? "bg-brand/25 text-brand-bright font-semibold shadow-xs"
                      : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  5-Year (2030)
                </button>
              </div>
            </div>

            {/* Main Target KPI Card */}
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-3.5 flex items-baseline justify-between">
              <div>
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                  {targetYearLabel} Modeled Target
                </span>
                <p className="text-2xl font-bold text-white tabular-nums">
                  {currency(targetPrice, 2)}
                </p>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Annualized pace:{" "}
                  <strong className="text-emerald-300 tabular-nums">
                    +{targetCagrPct.toFixed(1)}%/yr
                  </strong>
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gain tabular-nums">
                  {targetGainPct >= 0 ? "+" : ""}
                  {percent(targetGainPct)}
                </span>
                <p className="text-[10px] text-zinc-400">from current spot</p>
              </div>
            </div>

            {/* Year-by-Year Forecast Roadmap Strip */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                  Year-by-Year Target Roadmap
                </span>
                <span className="text-[10px] text-zinc-400">
                  Matches Forecast sheet
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {FORECAST_YEARS.map((yr) => {
                  const p = forecastSummary.eoyPrices[yr];
                  const g = forecastSummary.eoyGains[yr];
                  const isTargeted = forecastSummary.targetedYears[yr];
                  const isCurrentHorizon =
                    (horizon === "3y" && yr === 2028) ||
                    (horizon === "5y" && yr === 2030);

                  if (editingYear === yr) {
                    return (
                      <div
                        key={yr}
                        className="rounded-lg border border-brand bg-zinc-900 p-1 text-center"
                      >
                        <span className="text-[9px] font-bold text-brand-bright">
                          &apos;{String(yr).slice(2)}
                        </span>
                        <input
                          type="text"
                          autoFocus
                          value={yearDraftPrice}
                          onChange={(e) => setYearDraftPrice(e.target.value)}
                          onBlur={() => handleYearEditCommit(yr)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleYearEditCommit(yr);
                            if (e.key === "Escape") setEditingYear(null);
                          }}
                          className="w-full text-center text-xs font-semibold text-white outline-none bg-transparent"
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
                      title={`Click to edit EOY ${yr} price`}
                      className={cn(
                        "rounded-lg border p-1.5 text-center transition hover:border-zinc-600",
                        isCurrentHorizon
                          ? "border-brand/50 bg-brand/10 ring-1 ring-brand/30"
                          : "border-zinc-800 bg-zinc-900/50",
                        isTargeted && !isCurrentHorizon && "border-zinc-700"
                      )}
                    >
                      <p className="text-[9px] uppercase tracking-wider text-zinc-400">
                        &apos;{String(yr).slice(2)}
                      </p>
                      <p className="text-xs font-bold tabular-nums text-zinc-100">
                        ${Math.round(p)}
                      </p>
                      <p className="text-[9px] tabular-nums text-gain font-medium">
                        {g >= 0 ? "+" : ""}
                        {(g * 100).toFixed(0)}%
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Valuation Sandbox / Custom Growth Simulator */}
            <div className="pt-1 border-t border-zinc-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">
                  Custom Growth Sandbox
                </span>
                <button
                  type="button"
                  onClick={() => setShowValuation(!showValuation)}
                  className="text-xs font-semibold text-brand-bright hover:underline"
                >
                  {showValuation ? "Close sandbox" : "Test custom CAGR"}
                </button>
              </div>

              {showValuation && (
                <div className="mt-2.5 space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-400">Modeled Growth Pace</span>
                      <span className="font-bold text-brand-bright tabular-nums">
                        {customCagr}% / yr
                      </span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={75}
                      step={1}
                      value={customCagr}
                      onChange={(e) => setCustomCagr(Number(e.target.value))}
                      className="w-full accent-[var(--brand)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>5% (Conservative)</span>
                      <span>35% (Growth)</span>
                      <span>75% (Hyper)</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-zinc-800 pt-2 text-xs">
                    <div>
                      <span className="text-zinc-400">Resulting Target: </span>
                      <strong className="text-white tabular-nums">
                        {currency(customModeledPrice, 2)}
                      </strong>
                      <span className="ml-1 text-gain tabular-nums">
                        (+{percent(customGainPct)})
                      </span>
                    </div>
                    {onSetEoyPrice && (
                      <button
                        type="button"
                        onClick={commitCustomTarget}
                        className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-[#121214] hover:bg-brand-bright transition"
                      >
                        Set as {targetYearLabel}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-400">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                Momentum
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-200">
                {streak.label}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3">
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-400">
                <Layers className="h-3.5 w-3.5 text-brand-bright" />
                Exposure
              </p>
              <p className="mt-1 text-sm font-semibold text-zinc-200 truncate">
                {shockProfile.label}
              </p>
            </div>
          </div>

          {/* Covered Call Target (if available) */}
          {coveredCallRow && coveredCallRow.nextStrike != null && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Covered Call Write Plan
                </p>
                <span className="text-xs font-semibold text-sky-400 tabular-nums">
                  {coveredCallRow.yield2w != null
                    ? `${percent(coveredCallRow.yield2w)} yield`
                    : "Active"}
                </span>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-zinc-400">Next Strike</span>
                  <p className="text-sm font-semibold text-white tabular-nums">
                    {currency(coveredCallRow.nextStrike)}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-400">Buffer Distance</span>
                  <p className="text-sm font-semibold text-zinc-200 tabular-nums">
                    {coveredCallRow.targetDistance != null
                      ? percent(coveredCallRow.targetDistance)
                      : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-400">Contracts</span>
                  <p className="text-sm font-semibold text-zinc-200 tabular-nums">
                    {coveredCallRow.contracts} ({coveredCallRow.contracts * 100} sh)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Conviction Selector */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Conviction (1 to 5)
              </p>
              <span className="text-xs font-bold text-amber-300">
                Level {level}
              </span>
            </div>

            <div className="mt-2.5 flex gap-1.5">
              {([1, 2, 3, 4, 5] as ConvictionLevel[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onConviction(n, thesis)}
                  title={CONVICTION_LABELS[n]}
                  className={cn(
                    "h-9 flex-1 rounded-lg text-sm font-bold transition touch-target",
                    level === n
                      ? "bg-brand/25 text-brand-bright ring-1 ring-brand/50 shadow-sm"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-300">{CONVICTION_LABELS[level]}</p>
          </div>

          {/* Thesis Notes */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Thesis Notes
            </p>
            <textarea
              value={thesisDraft}
              rows={3}
              onChange={(e) => setThesisDraft(e.target.value)}
              onBlur={() => onConviction(level, thesisDraft)}
              placeholder="Why do you own this? Ground your conviction here."
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-xs leading-relaxed text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
            />
            <p className="mt-1.5 text-xs text-zinc-400">
              Pulse and Forecast read this. Saves when you leave the box.
            </p>
          </div>

          {/* Ask Margus CTA */}
          {onAskMargus && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAskMargus();
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 transition"
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
