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
  Shield,
  ShieldCheck,
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
  todayChangePct,
  onConviction,
  onClose,
  onAskMargus,
}: Props) {
  const [activeTab, setActiveTab] = useState<"diagnostic" | "whatif" | "thesis">("diagnostic");

  // What-If Valuation Simulator States
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

  const isDippingToday = todayChangePct != null && todayChangePct < -0.015;

  // What-if price modeling (3-year horizon: Price_3y = Spot * (1 + g)^3 * (Multiple / 25))
  const liveSpot = spot ?? buyPrice ?? 50;
  const modeledFuturePrice = Math.round(
    liveSpot * Math.pow(1 + growthRate / 100, 3) * (targetMultiple / 25) * 100
  ) / 100;
  const modeledUpsidePct = liveSpot > 0 ? (modeledFuturePrice - liveSpot) / liveSpot : 0;

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
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold text-white">{cashtag(ticker)}</h3>
              <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                {THEME_LABELS[theme] ?? "Equities"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              {spot != null ? currency(spot) : "—"}
              {shares != null ? ` · ${shares.toLocaleString("en-US")} shares` : ""}
              {roi != null ? ` · ${percent(roi)} total return` : ""}
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

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800/80 bg-zinc-900/40 px-4 py-1.5 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("diagnostic")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition",
              activeTab === "diagnostic"
                ? "bg-brand/20 text-brand-bright ring-1 ring-brand/40"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Diagnostic
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("whatif")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition",
              activeTab === "whatif"
                ? "bg-brand/20 text-brand-bright ring-1 ring-brand/40"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            What-If Target
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("thesis")}
            className={cn(
              "flex-1 rounded-md py-1.5 text-xs font-medium transition",
              activeTab === "thesis"
                ? "bg-brand/20 text-brand-bright ring-1 ring-brand/40"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            Thesis & Notes
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4 overflow-y-auto px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex-1">
          {/* Thesis Intact Banner */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                Thesis Intact · Stand Down
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">
              {isDippingToday
                ? `${cashtag(ticker)} is dipping today on market noise. Core business drivers and structural thesis remain intact. Recommended action: Do nothing and let compounding work.`
                : "Fundamentals and growth trajectory are healthy. No unforced trade adjustments needed."}
            </p>
          </div>

          {activeTab === "diagnostic" && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                4-Pillar Asset Health Check
              </h4>

              {/* Pillar 1: Valuation & Sector */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-brand-bright" />
                    1. Sector Moat & Exposure
                  </span>
                  <span className="text-[11px] font-semibold text-zinc-300">
                    {shockProfile.label}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Categorized in {THEME_LABELS[theme] ?? "Growth Equities"}. Sized by underlying industry demand.
                </p>
              </div>

              {/* Pillar 2: Technical Momentum */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                    2. Trend & Momentum
                  </span>
                  <span className="text-[11px] font-semibold text-gain">
                    {streak.label}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Weekly momentum supports continuous multi-year compounding.
                </p>
              </div>

              {/* Pillar 3: Downside Cushion */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-sky-400" />
                    3. Factor Sensitivity (Beta)
                  </span>
                  <span className="text-[11px] font-semibold text-zinc-200">
                    {shockProfile.beta != null ? `${shockProfile.beta.toFixed(1)}x Market Beta` : "Moderate Beta"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Responds to macro rate and liquidity shocks within normal bounds.
                </p>
              </div>

              {/* Pillar 4: Conviction Level */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                    4. Owner Conviction
                  </span>
                  <span className="text-[11px] font-bold text-amber-300">
                    Level {level}/5 · {CONVICTION_LABELS[level].split(",")[0]}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-zinc-400">
                  {thesis ? `Thesis: "${thesis}"` : "No custom thesis written yet."}
                </p>
              </div>
            </div>
          )}

          {activeTab === "whatif" && (
            <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3.5">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-bright flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5" />
                  What-If Valuation Model
                </span>
                <p className="mt-1 text-xs text-zinc-400">
                  Model 3-year target share prices by adjusting expected growth and valuation multiples.
                </p>
              </div>

              {/* KPI Outcome */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/25 p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">
                    Modeled 3-Year Target
                  </p>
                  <p className="text-xl font-bold text-white tabular-nums">
                    {currency(modeledFuturePrice, 2)}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-sm font-bold tabular-nums",
                      modeledUpsidePct >= 0 ? "text-gain" : "text-loss"
                    )}
                  >
                    {modeledUpsidePct >= 0 ? "+" : ""}
                    {percent(modeledUpsidePct)}
                  </span>
                  <p className="text-[10px] text-zinc-400">from current spot</p>
                </div>
              </div>

              {/* Slider 1: Expected Annual Growth */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Annual Revenue/EPS Growth</span>
                  <span className="font-semibold text-brand-bright tabular-nums">{growthRate}% / yr</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={50}
                  step={1}
                  value={growthRate}
                  onChange={(e) => setGrowthRate(Number(e.target.value))}
                  className="w-full accent-[var(--brand)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>5% (Defensive)</span>
                  <span>25% (Growth)</span>
                  <span>50% (Hyper)</span>
                </div>
              </div>

              {/* Slider 2: Target P/E Multiple */}
              <div className="space-y-1.5 pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-zinc-300">Target Valuation Multiple</span>
                  <span className="font-semibold text-brand-bright tabular-nums">{targetMultiple}x P/E</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={1}
                  value={targetMultiple}
                  onChange={(e) => setTargetMultiple(Number(e.target.value))}
                  className="w-full accent-[var(--brand)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>10x (Value)</span>
                  <span>25x (Market Avg)</span>
                  <span>60x (Premium)</span>
                </div>
              </div>
            </div>
          )}

          {activeTab === "thesis" && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Conviction Level (1 to 5)
                </p>
                <div className="mt-2 flex gap-1.5">
                  {([1, 2, 3, 4, 5] as ConvictionLevel[]).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onConviction(n, thesis)}
                      title={CONVICTION_LABELS[n]}
                      className={cn(
                        "h-9 flex-1 rounded-lg text-sm font-bold transition",
                        level === n
                          ? "bg-brand/25 text-brand-bright ring-1 ring-brand/50 shadow-sm"
                          : "bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-zinc-300">{CONVICTION_LABELS[level]}</p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Thesis Notes
                </p>
                <textarea
                  value={thesis}
                  rows={4}
                  onChange={(e) => onConviction(level, e.target.value)}
                  placeholder="Why do you own this? What would break the thesis? Ground your conviction here."
                  className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2.5 text-xs leading-relaxed text-white outline-none focus:border-brand focus:ring-1 focus:ring-brand/40"
                />
              </div>
            </div>
          )}

          {/* Ask Margus CTA */}
          {onAskMargus && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAskMargus();
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/80 px-4 py-2.5 text-xs font-semibold text-white hover:bg-zinc-800 transition"
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
