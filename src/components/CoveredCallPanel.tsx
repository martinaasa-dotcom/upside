"use client";

import { FluidRow, FluidTable, cellBase } from "@/components/FluidTable";
import { cn, currency, percent } from "@/lib/format";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import type { CoveredCallRow } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";

type WriteLevelState = "near-strike" | "at-target" | "approaching";

/**
 * Where spot actually sits against the plan. "At write level" has to mean
 * spot reached the target, not merely got within 2% of it: a row sitting
 * 1.9% BELOW its write level was getting the same badge as one 4% past it,
 * which reads as "you can write this now" when you can't. The at-target
 * threshold matches buildStrikeAlerts in lib/alerts.ts, so the badge and
 * the Alerts tab fire on the same condition.
 */
function writeLevelState(r: CoveredCallRow): WriteLevelState | null {
  const spot = r.spot;
  if (spot == null || !(spot > 0)) return null;
  if (r.nextStrike != null && r.nextStrike > 0 && spot / r.nextStrike >= 0.98) {
    return "near-strike";
  }
  if (r.stockTarget == null) return null;
  if (spot >= r.stockTarget) return "at-target";
  if (spot >= r.stockTarget * 0.98) return "approaching";
  return null;
}

const WRITE_LEVEL_BADGE: Record<
  WriteLevelState,
  { label: string; className: string; title: string }
> = {
  "near-strike": {
    label: "Near strike",
    className: "bg-rose-500/20 text-rose-200",
    title: "Spot is within 2% of the strike you'd be selling, so assignment is live",
  },
  "at-target": {
    label: "At write level",
    className: "bg-amber-500/20 text-amber-200",
    title: "Spot reached your stock target, this is the level you planned to write at",
  },
  approaching: {
    label: "Almost at write level",
    className: "bg-zinc-700/60 text-zinc-300",
    title: "Spot is within 2% below your stock target, not there yet",
  },
};

type Props = {
  rows: CoveredCallRow[];
  yield2wAvg: number;
  premiumTotal: number;
  onPatchTargetCall: (holdingId: string, targetCallPct: number) => void;
  onPatchStockTarget: (holdingId: string, stockTarget: number) => void;
  onAddHolding?: () => void;
};

function signedTone(value: number) {
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-zinc-300";
}

function InlineTargetCall({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (pct: number) => void;
}) {
  const display = formatDecimal(Math.round(value * 100), 0);
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <div className="inline-flex items-center justify-center gap-0.5">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
        onFocus={() => {
          focused.current = true;
        }}
        onWheel={blockWheelChange}
        onBlur={() => {
          focused.current = false;
          const n = parseDecimal(draft);
          if (!Number.isNaN(n) && Math.round(n) / 100 !== value) {
            onCommit(Math.round(n) / 100);
          } else setDraft(display);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="inline-edit no-spinner w-12 rounded-t py-0.5 text-center tabular-nums text-zinc-100 outline-none hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-brand/40"
      />
      <span className="text-xs text-zinc-500">%</span>
    </div>
  );
}

function InlineStockTarget({
  value,
  onCommit,
}: {
  value: number | null;
  onCommit: (price: number) => void;
}) {
  const display =
    value != null && value > 0 ? formatDecimal(value, 2) : "";
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <div className="inline-flex items-center justify-center gap-0.5">
      <span className="text-xs text-zinc-500">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={draft}
        placeholder="—"
        onChange={(e) =>
          setDraft(e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))
        }
        onFocus={() => {
          focused.current = true;
        }}
        onWheel={blockWheelChange}
        onBlur={() => {
          focused.current = false;
          const n = parseDecimal(draft);
          if (!Number.isNaN(n) && n > 0 && n !== value) {
            onCommit(Math.round(n * 100) / 100);
          } else setDraft(display);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setDraft(display);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="inline-edit no-spinner w-[4.5rem] rounded-t py-0.5 text-center tabular-nums text-zinc-100 outline-none hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-brand/40"
      />
    </div>
  );
}

const TEMPLATE = "repeat(10, minmax(max-content, 1fr))";

const HEADERS = [
  "Ticker",
  "Spot",
  "Call %",
  "Stock target",
  "Distance",
  "Next strike",
  "Expiration",
  "Contracts",
  "CC yield",
  "Premium",
] as const;

const HEADER_HINTS: Partial<Record<(typeof HEADERS)[number], string>> = {
  "Call %": "OTM % used to pick the strike: higher means further out, less premium",
  "Stock target": "Price you're planning to write or roll a call toward",
  Distance: "(Stock target − spot) / spot. Negative means spot is at/past target",
  "Next strike": "Stock target × (1 + Call %), rounded to a tradable strike",
  "CC yield": "Modeled 2-week premium yield if you wrote at the next strike today",
};

export function CoveredCallPanel({
  rows,
  yield2wAvg,
  premiumTotal,
  onPatchTargetCall,
  onPatchStockTarget,
  onAddHolding,
}: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-brand-deep/30 bg-[#161618]/70">
      <header className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">
          Covered Call Targets
        </h2>
      </header>

      {/* Mobile cards */}
      <div className="space-y-2 p-3 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">
              Add holdings to generate covered-call targets.
            </p>
            {onAddHolding && (
              <button
                type="button"
                onClick={onAddHolding}
                className="mt-3 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
              >
                Add holding
              </button>
            )}
          </div>
        ) : (
          rows.map((r) => (
            <div
              key={r.holding.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-semibold text-white">
                  {r.holding.ticker}
                </p>
                <p className="text-sm tabular-nums text-zinc-400">
                  Spot {currency(r.spot)}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="mb-1 text-zinc-500">Call %</p>
                  <InlineTargetCall
                    value={r.targetCall}
                    onCommit={(pct) => onPatchTargetCall(r.holding.id, pct)}
                  />
                </div>
                <div>
                  <p className="mb-1 text-zinc-500">Stock target</p>
                  <InlineStockTarget
                    value={r.stockTarget}
                    onCommit={(price) =>
                      onPatchStockTarget(r.holding.id, price)
                    }
                  />
                </div>
                <div>
                  <p className="text-zinc-500">Distance</p>
                  <p
                    className={cn(
                      "tabular-nums font-medium",
                      r.targetDistance != null
                        ? signedTone(r.targetDistance)
                        : "text-zinc-600"
                    )}
                  >
                    {r.targetDistance != null
                      ? percent(r.targetDistance)
                      : "—"}
                  </p>
                  {(() => {
                    const state = writeLevelState(r);
                    if (!state) return null;
                    const badge = WRITE_LEVEL_BADGE[state];
                    return (
                      <span
                        title={badge.title}
                        className={cn(
                          "mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
                <div>
                  <p className="text-zinc-500">Next strike</p>
                  <p className="tabular-nums font-semibold text-brand">
                    {r.nextStrike != null ? currency(r.nextStrike) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">CC yield</p>
                  <p className="tabular-nums font-medium text-sky-400">
                    {r.yield2w != null ? percent(r.yield2w) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Premium</p>
                  <p className="tabular-nums text-zinc-100">
                    {r.premium != null ? currency(r.premium) : "—"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {r.contracts} contracts
                {r.expiration
                  ? ` · exp ${format(parseISO(r.expiration), "MMM d, yyyy")}`
                  : ""}
              </p>
            </div>
          ))
        )}
        {rows.length > 0 && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-3 text-sm">
            <div className="flex justify-between">
              <span className="font-semibold text-white">Total</span>
              <span className="tabular-nums text-sky-400">
                {percent(yield2wAvg)}
              </span>
            </div>
            <p className="mt-1 tabular-nums text-zinc-300">
              Premium {currency(premiumTotal)}
            </p>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <FluidTable template={TEMPLATE}>
          <FluidRow className="border-zinc-800 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            {HEADERS.map((label) => (
              <div
                key={label}
                className={cellBase}
                title={HEADER_HINTS[label]}
              >
                {label}
              </div>
            ))}
          </FluidRow>

          {rows.length === 0 && (
            <div className="col-span-full px-3 py-10 text-center text-sm text-zinc-500">
              Add holdings above to generate covered-call targets.
              {onAddHolding && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={onAddHolding}
                    className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
                  >
                    Add holding
                  </button>
                </div>
              )}
            </div>
          )}

          {rows.map((r) => (
            <FluidRow key={r.holding.id} className="hover:bg-zinc-900/40">
              <div
                className={cn(
                  cellBase,
                  "font-semibold tracking-wide text-white"
                )}
              >
                {r.holding.ticker}
              </div>
              <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                {currency(r.spot)}
              </div>
              <div className={cn(cellBase, "py-1")}>
                <InlineTargetCall
                  value={r.targetCall}
                  onCommit={(pct) => onPatchTargetCall(r.holding.id, pct)}
                />
              </div>
              <div className={cn(cellBase, "py-1")}>
                <InlineStockTarget
                  value={r.stockTarget}
                  onCommit={(price) => onPatchStockTarget(r.holding.id, price)}
                />
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums font-medium",
                  r.targetDistance != null
                    ? signedTone(r.targetDistance)
                    : "text-zinc-600"
                )}
              >
                <span className="flex flex-col items-center gap-0.5">
                  <span>
                    {r.targetDistance != null
                      ? percent(r.targetDistance)
                      : "—"}
                  </span>
                  {(() => {
                    const state = writeLevelState(r);
                    if (!state) return null;
                    const badge = WRITE_LEVEL_BADGE[state];
                    return (
                      <span
                        title={badge.title}
                        className={cn(
                          "rounded-md px-1.5 py-0.5 text-[11px] font-medium normal-case",
                          badge.className
                        )}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                </span>
              </div>
              <div
                className={cn(
                  cellBase,
                  "tabular-nums font-semibold text-brand"
                )}
              >
                {r.nextStrike != null ? currency(r.nextStrike) : "—"}
              </div>
              <div className={cn(cellBase, "text-zinc-400")}>
                {r.expiration
                  ? format(parseISO(r.expiration), "MMM d, yyyy")
                  : "—"}
              </div>
              <div className={cn(cellBase, "tabular-nums text-zinc-300")}>
                {Math.round(r.contracts)}
              </div>
              <div
                className={cn(cellBase, "tabular-nums font-medium text-sky-400")}
              >
                {r.yield2w != null ? percent(r.yield2w) : "—"}
              </div>
              <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                {r.premium != null ? currency(r.premium) : "—"}
              </div>
            </FluidRow>
          ))}

          {rows.length > 0 && (
            <FluidRow className="border-t border-zinc-700 bg-zinc-900/60 font-semibold">
              <div className={cn(cellBase, "py-2.5 text-white")}>Total</div>
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5 tabular-nums text-sky-400")}>
                {percent(yield2wAvg)}
              </div>
              <div className={cn(cellBase, "py-2.5 tabular-nums text-white")}>
                {currency(premiumTotal)}
              </div>
            </FluidRow>
          )}
        </FluidTable>
      </div>
    </section>
  );
}
