"use client";

import { currency, percent, cn, cashtag } from "@/lib/format";
import type { ConvictionEntry, ConvictionLevel } from "@/lib/conviction";
import { estimateGreenStreak } from "@/lib/streaks";
import { forecastThemeForTicker } from "@/lib/forecast-conviction";
import { getShockProfile } from "@/lib/book-shock";
import {
  Bot,
  Calculator,
  Layers,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

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
  conviction?: ConvictionEntry | null;
  todayChangePct?: number | null;
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
  conviction,
  onConviction,
  onClose,
  onAskMargus,
}: Props) {
  const [showValuation, setShowValuation] = useState(false);
  const [growthRate, setGrowthRate] = useState<number>(18);
  const [targetMultiple, setTargetMultiple] = useState<number>(25);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !ticker) return null;

  const streak = estimateGreenStreak(sparkline);
  const roi =
    spot != null && buyPrice != null && buyPrice > 0
      ? (spot - buyPrice) / buyPrice
      : null;
  const level = conviction?.level ?? 3;
  const thesis = conviction?.thesis ?? "";
  const theme = forecastThemeForTicker(ticker);
  const shockProfile = getShockProfile(ticker);

  // Modeled 3-year target share price
  const liveSpot = spot ?? buyPrice ?? 50;
  const modeledFuturePrice =
    Math.round(
      liveSpot * Math.pow(1 + growthRate / 100, 3) * (targetMultiple / 25) * 100
    ) / 100;
  const modeledUpsidePct =
    liveSpot > 0 ? (modeledFuturePrice - liveSpot) / liveSpot : 0;

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
              value={thesis}
              rows={3}
              onChange={(e) => onConviction(level, e.target.value)}
              placeholder="Why do you own this? Ground your conviction here."
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-xs leading-relaxed text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
            />
          </div>

          {/* Collapsible What-If Valuation Simulator */}
          <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                <Calculator className="h-3.5 w-3.5 text-brand-bright" />
                3-Year Target Model
              </span>
              <button
                type="button"
                onClick={() => setShowValuation(!showValuation)}
                className="text-xs font-medium text-brand-bright hover:underline"
              >
                {showValuation ? "Hide" : "Customize"}
              </button>
            </div>

            <div className="mt-2.5 flex items-baseline justify-between">
              <div>
                <p className="text-xs text-zinc-400">Estimated Target</p>
                <p className="text-lg font-bold text-white tabular-nums">
                  {currency(modeledFuturePrice, 2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-400">Implied Move</p>
                <p
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    modeledUpsidePct >= 0 ? "text-gain" : "text-loss"
                  )}
                >
                  {modeledUpsidePct >= 0 ? "+" : ""}
                  {percent(modeledUpsidePct)}
                </p>
              </div>
            </div>

            {showValuation && (
              <div className="mt-3 space-y-3 border-t border-zinc-800/80 pt-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Expected Annual Growth</span>
                    <span className="font-semibold text-zinc-200 tabular-nums">
                      {growthRate}% / yr
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={45}
                    value={growthRate}
                    onChange={(e) => setGrowthRate(Number(e.target.value))}
                    className="w-full accent-[var(--brand)] cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-400">Exit P/E Multiple</span>
                    <span className="font-semibold text-zinc-200 tabular-nums">
                      {targetMultiple}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={50}
                    value={targetMultiple}
                    onChange={(e) => setTargetMultiple(Number(e.target.value))}
                    className="w-full accent-[var(--brand)] cursor-pointer"
                  />
                </div>
              </div>
            )}
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
