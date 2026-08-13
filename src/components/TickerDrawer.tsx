"use client";

import { currency, percent, cn, cashtag } from "@/lib/format";
import type { ConvictionEntry, ConvictionLevel } from "@/lib/conviction";
import { estimateGreenStreak } from "@/lib/streaks";
import { X } from "lucide-react";
import { useEffect } from "react";

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  1: "Weak, watching for an exit",
  2: "Below average, trimming candidate",
  3: "Neutral, holding as-is",
  4: "Strong, comfortable adding",
  5: "Max, highest-confidence thesis",
};

type Props = {
  open: boolean;
  ticker: string | null;
  spot: number | null;
  shares: number | null;
  buyPrice: number | null;
  sparkline?: number[];
  conviction?: ConvictionEntry | null;
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

  return (
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close drawer"
        onClick={onClose}
      />
    <div className="relative flex h-full w-full max-w-none flex-col border-l border-zinc-700 bg-[#121214] shadow-2xl sm:max-w-md">
        <div className="flex items-start justify-between gap-2 border-b border-zinc-800 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div>
            <h3 className="text-lg font-semibold text-white">{cashtag(ticker)}</h3>
            <p className="text-xs text-zinc-500">
              {spot != null ? currency(spot) : "—"}
              {shares != null ? ` · ${shares.toLocaleString("en-US")} sh` : ""}
              {roi != null ? ` · ${percent(roi)} vs cost` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-3.5 text-zinc-400 hover:bg-zinc-800 sm:p-1.5"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Streak
            </p>
            <p className="mt-1 text-sm text-zinc-200">{streak.label}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Conviction (1–5)
            </p>
            <div className="mt-2 flex gap-1">
              {([1, 2, 3, 4, 5] as ConvictionLevel[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onConviction(n, thesis)}
                  title={CONVICTION_LABELS[n]}
                  className={cn(
                    "h-9 w-9 rounded-lg text-sm font-semibold",
                    level === n
                      ? "bg-brand/25 text-brand-bright ring-1 ring-brand/50"
                      : "bg-zinc-900 text-zinc-400 hover:text-white"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-zinc-600">
              <span>Low conviction</span>
              <span>{CONVICTION_LABELS[level]}</span>
              <span>High conviction</span>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Thesis
            </p>
            <textarea
              value={thesis}
              onChange={(e) => onConviction(level, e.target.value)}
              rows={4}
              placeholder="Why we hold this: moat, path, invalidation …"
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
            />
          </div>
          {sparkline && sparkline.length > 1 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                ~90d path
              </p>
              <svg
                viewBox={`0 0 ${sparkline.length} 40`}
                className="mt-2 h-16 w-full text-brand"
                preserveAspectRatio="none"
              >
                {(() => {
                  const min = Math.min(...sparkline);
                  const max = Math.max(...sparkline);
                  const span = max - min || 1;
                  const d = sparkline
                    .map(
                      (p, i) =>
                        `${i === 0 ? "M" : "L"}${i},${40 - ((p - min) / span) * 36 - 2}`
                    )
                    .join(" ");
                  return (
                    <path
                      d={d}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })()}
              </svg>
            </div>
          )}
          {onAskMargus && (
            <button
              type="button"
              onClick={() => {
                onAskMargus();
                onClose();
              }}
              className="w-full rounded-lg border border-brand-deep/50 bg-brand/10 px-3 py-2 text-sm font-medium text-brand-bright hover:bg-brand/20"
            >
              Ask Margus about {cashtag(ticker)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
