"use client";

import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { currency, percent, signedPercent, cn, cashtag } from "@/lib/format";
import { Card, MicroLabel, Pill, Segmented } from "@/components/ui/Panel";
import type { ConvictionEntry, ConvictionLevel } from "@/lib/conviction";
import { estimateGreenStreak } from "@/lib/streaks";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import { THEME_LABEL } from "@/lib/portfolio-personality";
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
  5: "Max, you're sure why you own it",
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
    <ViewportOverlay className="z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <div className="relative flex h-full w-full max-w-none flex-col border-l border-border/80 bg-app shadow-2xl sm:max-w-md">
        <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3.5 pt-[max(0.875rem,env(safe-area-inset-top))]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-foreground">
                {cashtag(ticker)}
              </h2>
              <Pill tone="neutral">{THEME_LABEL[theme] ?? "other businesses"}</Pill>
            </div>
            <p className="mt-1 text-sm tabular-nums text-muted">
              {spot != null ? currency(spot) : "—"}
              {todayChangePct != null && (
                <span
                  className={cn(
                    "ml-1 font-medium tabular-nums",
                    todayChangePct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  ({signedPercent(todayChangePct)})
                </span>
              )}
              {shares != null ? ` · ${shares.toLocaleString("en-US")} shares` : ""}
              {roi != null ? ` · ${percent(roi)} vs cost` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="touch-target shrink-0 rounded-lg p-2 text-muted transition hover:bg-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Card>
            <MicroLabel>Thesis</MicroLabel>
            <textarea
              value={thesisDraft}
              rows={3}
              onChange={(e) => setThesisDraft(e.target.value)}
              onBlur={() => onConviction(level, thesisDraft)}
              placeholder="Two sentences. What has to stay true for you to keep holding?"
              className="mt-2 w-full rounded-lg border border-border bg-app p-2.5 text-base leading-relaxed text-foreground outline-none placeholder:text-muted focus:border-white/25"
            />
            <p className="mt-1.5 text-sm text-muted">
              Pulse reads this first. Leave it blank and it still works from headlines and today’s prices.
            </p>
            {conviction?.stamps && conviction.stamps.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                {conviction.stamps.slice(0, 3).map((s) => (
                  <li key={s.at} className="text-sm text-muted">
                    <span className="text-foreground/80">{s.verdict}</span>
                    {" · "}
                    {s.line}
                    <span className="ml-1 text-muted">
                      {new Date(s.at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Price path — the same numbers as the Forecast table, never a
            * second opinion. */}
          <section className="space-y-3 rounded-2xl border border-border bg-card/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-foreground">
                  Price path
                </h3>
                <p className="mt-0.5 text-sm text-muted">
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
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                    {currency(targetPrice, 2)}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    Works out to about{" "}
                    <span className="font-medium tabular-nums text-gain">
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
                  <p className="mt-0.5 text-sm text-muted">
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
                        className="rounded-lg border border-brand bg-well px-1 py-1.5 text-center"
                      >
                        <p className="text-sm font-medium text-brand-bright">
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
                          className="mt-0.5 w-full bg-transparent text-center text-sm font-semibold tabular-nums text-foreground outline-none"
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
                        "rounded-lg border px-1 py-2 text-center transition hover:border-brand-mid",
                        isCurrentHorizon
                          ? "border-brand/50 bg-brand/10"
                          : "border-border bg-well/40"
                      )}
                    >
                      <p className="text-sm text-muted">
                        &apos;{String(yr).slice(2)}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                        ${Math.round(p)}
                      </p>
                      <p
                        className={cn(
                          "text-sm tabular-nums",
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
              <p className="mt-1 text-sm font-medium text-foreground">
                {streak.label}
              </p>
            </Card>
            <Card>
              <MicroLabel>Moves with</MicroLabel>
              <p className="mt-1 truncate text-sm font-medium text-foreground">
                {shockProfile.label}
              </p>
            </Card>
          </div>

          {coveredCallRow && coveredCallRow.nextStrike != null && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <MicroLabel>Your call plan</MicroLabel>
                {coveredCallRow.yield2w != null && (
                  <span className="text-sm font-medium tabular-nums text-brand-bright">
                    {percent(coveredCallRow.yield2w)} for two weeks
                  </span>
                )}
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-sm text-muted">Strike</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {currency(coveredCallRow.nextStrike)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted">Room above</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {coveredCallRow.targetDistance != null
                      ? percent(coveredCallRow.targetDistance)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted">Contracts</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {coveredCallRow.contracts}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MicroLabel>How sure are you?</MicroLabel>
              <span className="text-sm font-medium text-caution">
                {level} of 5
              </span>
            </div>
            <div
              role="radiogroup"
              aria-label="How sure are you"
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
                      : "border border-border bg-well/40 text-muted hover:text-foreground"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-foreground/80">
              {CONVICTION_LABELS[level]}
            </p>
          </Card>

          {onAskMargus && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAskMargus();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-well px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-hover"
            >
              <Bot className="h-4 w-4 text-brand-bright" />
              Ask Margus about {cashtag(ticker)}
            </button>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
}
