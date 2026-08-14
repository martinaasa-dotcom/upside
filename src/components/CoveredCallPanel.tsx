"use client";

import { FluidRow, FluidTable, cellBase } from "@/components/FluidTable";
import { Card, EmptyState, Panel, PanelHeader } from "@/components/ui/Panel";
import { cn, signedTone, currency, percent, cashtag } from "@/lib/format";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import type { CoveredCallRow } from "@/lib/types";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";

type Props = {
  rows: CoveredCallRow[];
  yield2wAvg: number;
  premiumTotal: number;
  onPatchTargetCall: (holdingId: string, targetCallPct: number) => void;
  onPatchStockTarget: (holdingId: string, stockTarget: number) => void;
  onAddHolding?: () => void;
};

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
      <span className="text-xs text-zinc-400">%</span>
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
      <span className="text-xs text-zinc-400">$</span>
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

const TEMPLATE = "repeat(11, minmax(max-content, 1fr))";

const HEADERS = [
  "Ticker",
  "Spot",
  "Call %",
  "Stock target",
  "Distance",
  "Write",
  "Next strike",
  "Expires",
  "Contracts",
  "2-week %",
  "Premium",
] as const;

const HEADER_HINTS: Partial<Record<(typeof HEADERS)[number], string>> = {
  Spot: "What one share costs right now",
  "Call %": "How far above your target you set the strike. Further out pays less but is less likely to be called away",
  "Stock target": "The price you would be happy to sell at",
  Distance: "How far the price still has to travel to reach your target. Negative means it is already there",
  Write: "How close the stock is to the price you would write the call at",
  "Next strike": "The strike this plan points at, rounded to one you can actually trade",
  Contracts: "One contract covers 100 shares",
  "2-week %": "Premium as a percent of the shares tied up, over roughly two weeks",
  Premium: "The cash you would collect for selling these calls",
};

function writeProximity(distance: number | null): {
  label: string;
  className: string;
} {
  if (distance == null || !Number.isFinite(distance)) {
    return { label: "—", className: "text-zinc-400" };
  }
  if (distance <= 0) {
    return { label: "At write level", className: "text-brand-bright" };
  }
  if (distance < 0.04) {
    return { label: "Close", className: "text-amber-200" };
  }
  if (distance < 0.12) {
    return { label: "Getting near", className: "text-zinc-200" };
  }
  return { label: "Far from write", className: "text-zinc-400" };
}

/** Anchor Home uses to land on this table from "Open covered calls". */
export const COVERED_CALLS_ANCHOR = "covered-calls";

export function CoveredCallPanel({
  rows,
  yield2wAvg,
  premiumTotal,
  onPatchTargetCall,
  onPatchStockTarget,
  onAddHolding,
}: Props) {
  return (
    <Panel
      padded={false}
      id={COVERED_CALLS_ANCHOR}
      className="scroll-mt-28 overflow-hidden"
    >
      <div className="border-b border-zinc-800/80 p-5 sm:p-8">
        <PanelHeader title="Covered calls" />
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 p-3 md:hidden">
        {rows.length === 0 ? (
          <EmptyState
            title="Nothing to write calls on yet"
            detail="You need shares before you can write calls on them. Add a holding and this fills in."
            action={
              onAddHolding && (
                <button
                  type="button"
                  onClick={onAddHolding}
                  className="btn-primary px-3"
                >
                  Add holding
                </button>
              )
            }
          />
        ) : (
          rows.map((r) => (
            <Card key={r.holding.id} tone="raised">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-base font-semibold text-white">
                  {cashtag(r.holding.ticker)}
                </p>
                <p className="text-sm tabular-nums text-zinc-400">
                  Spot {currency(r.spot)}
                </p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="mb-1 text-zinc-400">Strike gap</p>
                  <InlineTargetCall
                    value={r.targetCall}
                    onCommit={(pct) => onPatchTargetCall(r.holding.id, pct)}
                  />
                </div>
                <div>
                  <p className="mb-1 text-zinc-400">Happy to sell at</p>
                  <InlineStockTarget
                    value={r.stockTarget}
                    onCommit={(price) =>
                      onPatchStockTarget(r.holding.id, price)
                    }
                  />
                </div>
                <div>
                  <p className="text-zinc-400">Still to go</p>
                  <p
                    className={cn(
                      "tabular-nums font-medium",
                      r.targetDistance != null
                        ? signedTone(r.targetDistance)
                        : "text-zinc-400"
                    )}
                  >
                    {r.targetDistance != null
                      ? percent(r.targetDistance)
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Write</p>
                  <p
                    className={cn(
                      "font-medium",
                      writeProximity(r.targetDistance).className
                    )}
                  >
                    {writeProximity(r.targetDistance).label}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Strike</p>
                  <p className="tabular-nums font-semibold text-brand">
                    {r.nextStrike != null ? currency(r.nextStrike) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">2-week %</p>
                  <p className="tabular-nums font-medium text-sky-400">
                    {r.yield2w != null ? percent(r.yield2w) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-400">Premium</p>
                  <p className="tabular-nums text-zinc-100">
                    {r.premium != null ? currency(r.premium) : "—"}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {Math.round(r.contracts)} contracts
                {r.expiration
                  ? ` · expires ${format(parseISO(r.expiration), "MMM d")}`
                  : ""}
              </p>
            </Card>
          ))
        )}
        {rows.length > 0 && (
          <Card tone="raised" className="text-sm">
            <div className="flex justify-between">
              <span className="font-semibold text-white">All together</span>
              <span className="tabular-nums text-sky-400">
                {percent(yield2wAvg)} over 2 weeks
              </span>
            </div>
            <p className="mt-1 tabular-nums text-zinc-300">
              {currency(premiumTotal)} in premium
            </p>
          </Card>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <FluidTable template={TEMPLATE}>
          <FluidRow className="border-zinc-800 text-xs font-medium uppercase tracking-wide text-zinc-400">
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
            <div className="col-span-full p-4 sm:p-6">
              <EmptyState
                title="Nothing to write calls on yet"
                detail="You need shares before you can write calls on them. Add a holding and this fills in."
                action={
                  onAddHolding && (
                    <button
                      type="button"
                      onClick={onAddHolding}
                      className="btn-primary px-3"
                    >
                      Add holding
                    </button>
                  )
                }
              />
            </div>
          )}

          {rows.map((r) => (
            <FluidRow key={r.holding.id} className="min-h-10 hover:bg-zinc-900/40">
              <div
                className={cn(
                  cellBase,
                  "font-semibold tracking-wide text-white"
                )}
              >
                {cashtag(r.holding.ticker)}
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
                    : "text-zinc-400"
                )}
              >
                {r.targetDistance != null ? percent(r.targetDistance) : "—"}
              </div>
              <div
                className={cn(
                  cellBase,
                  "whitespace-nowrap font-medium",
                  writeProximity(r.targetDistance).className
                )}
              >
                {writeProximity(r.targetDistance).label}
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
              <div className={cn(cellBase, "py-2.5 text-white")}>All</div>
              <div className={cn(cellBase, "py-2.5")} />
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
    </Panel>
  );
}
