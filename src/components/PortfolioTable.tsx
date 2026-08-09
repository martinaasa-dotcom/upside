"use client";

import { cn, currency, percent } from "@/lib/format";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import type { EnrichedHolding, Portfolio } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sparkline } from "./Sparkline";
import { FluidRow, FluidTable, cellBase } from "@/components/FluidTable";

export type HoldingPatch = {
  id: string;
  shares?: number;
  buy_price?: number;
  target_call_pct?: number;
  stock_target_override?: number | null;
};

type Props = {
  portfolio: Portfolio;
  holdings: EnrichedHolding[];
  totals: {
    buyValue: number;
    currentValue: number;
    roiDollar: number;
    roiPct: number;
    unrealizedProfits: number;
  };
  onPatch: (patch: HoldingPatch) => void;
  onDelete: (id: string) => void;
  onEditCash: () => void;
  onAddHolding?: () => void;
};

function signedTone(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-zinc-300";
}

function InlineNumber({
  value,
  digits = 0,
  onCommit,
  className,
}: {
  value: number;
  digits?: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const display = formatDecimal(value, digits);
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  return (
    <input
      type="text"
      inputMode={digits === 0 ? "numeric" : "decimal"}
      value={draft}
      onChange={(e) => {
        const next =
          digits === 0
            ? e.target.value.replace(/[^\d-]/g, "")
            : e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, "");
        setDraft(next);
      }}
      onFocus={() => {
        focused.current = true;
      }}
      onWheel={blockWheelChange}
      onBlur={() => {
        focused.current = false;
        const n = parseDecimal(draft);
        if (!Number.isNaN(n) && n !== value) {
          onCommit(digits === 0 ? Math.round(n) : Math.round(n * 100) / 100);
        } else setDraft(display);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "no-spinner rounded px-1 py-0.5 text-center tabular-nums text-zinc-100 outline-none hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-emerald-500/40",
        className ?? "mx-auto w-[5.25rem]"
      )}
    />
  );
}

const HEADERS = [
  "Ticker",
  "% Total",
  "Shares",
  "Buy",
  "Price",
  "ROI %",
  "Cost",
  "Value",
  "ROI $",
  "90d",
  "Today",
  "",
] as const;

const TEMPLATE =
  "repeat(11, minmax(max-content, 1fr)) minmax(2.25rem, 2.25rem)";

export function PortfolioTable({
  portfolio,
  holdings,
  totals,
  onPatch,
  onDelete,
  onEditCash,
  onAddHolding,
}: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <header className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Holdings</h2>
      </header>

      {/* Mobile cards */}
      <div className="space-y-2 p-3 md:hidden">
        <button
          type="button"
          onClick={onEditCash}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3 text-left"
        >
          <span className="text-sm font-medium text-amber-300/90">Cash</span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              signedTone(portfolio.cash_balance)
            )}
          >
            {currency(portfolio.cash_balance)}
          </span>
        </button>

        {holdings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">No holdings on this sheet yet.</p>
            {onAddHolding && (
              <button
                type="button"
                onClick={onAddHolding}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                Add holding
              </button>
            )}
          </div>
        ) : (
          holdings.map((h) => (
            <div
              key={h.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-white">{h.ticker}</p>
                  <p className="text-sm text-zinc-500">
                    {percent(h.pctOfTotal)} of book ·{" "}
                    {h.quote ? percent(h.quote.changePercent) : "—"} today
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(h.id)}
                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
                  aria-label={`Delete ${h.ticker}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <label className="grid gap-1 text-zinc-500">
                  Shares
                  <InlineNumber
                    value={h.shares}
                    digits={0}
                    onCommit={(shares) => onPatch({ id: h.id, shares })}
                    className="w-full text-left"
                  />
                </label>
                <label className="grid gap-1 text-zinc-500">
                  Buy
                  <InlineNumber
                    value={h.buy_price}
                    digits={2}
                    onCommit={(buy_price) => onPatch({ id: h.id, buy_price })}
                    className="w-full text-left"
                  />
                </label>
                <div>
                  <p className="text-zinc-500">Price</p>
                  <p className="tabular-nums text-zinc-100">
                    {currency(h.quote?.price ?? h.buy_price)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Value</p>
                  <p className="tabular-nums text-zinc-100">
                    {currency(h.currentValue)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">ROI %</p>
                  <p className={cn("tabular-nums font-medium", signedTone(h.roiPct))}>
                    {percent(h.roiPct)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">ROI $</p>
                  <p
                    className={cn(
                      "tabular-nums font-medium",
                      signedTone(h.roiDollar)
                    )}
                  >
                    {currency(h.roiDollar)}
                  </p>
                </div>
              </div>
              <div className="mt-2">
                <Sparkline
                  points={h.quote?.sparkline ?? []}
                  width={140}
                  height={28}
                />
              </div>
            </div>
          ))
        )}

        {holdings.length > 0 && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-3 text-sm">
            <div className="flex justify-between font-semibold">
              <span className="text-white">Portfolio</span>
              <span className={cn("tabular-nums", signedTone(totals.roiPct))}>
                {percent(totals.roiPct)}
              </span>
            </div>
            <div className="mt-1 flex justify-between text-zinc-400">
              <span>Value {currency(totals.currentValue)}</span>
              <span className={signedTone(totals.roiDollar)}>
                {currency(totals.roiDollar)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        {holdings.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-zinc-400">No holdings on this sheet yet.</p>
            {onAddHolding && (
              <button
                type="button"
                onClick={onAddHolding}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                Add holding
              </button>
            )}
          </div>
        ) : (
          <FluidTable template={TEMPLATE}>
            <FluidRow className="border-zinc-800 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              {HEADERS.map((label) => (
                <div key={label || "actions"} className={cellBase}>
                  {label}
                </div>
              ))}
            </FluidRow>

            <FluidRow className="border-zinc-800/70 bg-zinc-900/30">
              <div className={cn(cellBase, "font-medium text-amber-300/90")}>
                CASH
              </div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cellBase}>
                <button
                  type="button"
                  onClick={onEditCash}
                  className={cn(
                    "tabular-nums hover:underline",
                    signedTone(portfolio.cash_balance)
                  )}
                >
                  {currency(portfolio.cash_balance)}
                </button>
              </div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cn(cellBase, "text-zinc-600")}>—</div>
              <div className={cellBase} />
            </FluidRow>

            {holdings.map((h) => (
              <FluidRow key={h.id} className="group hover:bg-zinc-900/40">
                <div
                  className={cn(
                    cellBase,
                    "font-semibold tracking-wide text-white"
                  )}
                >
                  {h.ticker}
                </div>
                <div className={cn(cellBase, "tabular-nums text-zinc-400")}>
                  {percent(h.pctOfTotal)}
                </div>
                <div className={cn(cellBase, "py-1")}>
                  <InlineNumber
                    value={h.shares}
                    digits={0}
                    onCommit={(shares) => onPatch({ id: h.id, shares })}
                  />
                </div>
                <div className={cn(cellBase, "py-1")}>
                  <InlineNumber
                    value={h.buy_price}
                    digits={2}
                    onCommit={(buy_price) => onPatch({ id: h.id, buy_price })}
                  />
                </div>
                <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                  {currency(h.quote?.price ?? h.buy_price)}
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    signedTone(h.roiPct)
                  )}
                >
                  {percent(h.roiPct)}
                </div>
                <div className={cn(cellBase, "tabular-nums text-zinc-400")}>
                  {currency(h.buyValue)}
                </div>
                <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                  {currency(h.currentValue)}
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    signedTone(h.roiDollar)
                  )}
                >
                  {currency(h.roiDollar)}
                </div>
                <div className={cellBase}>
                  <Sparkline
                    points={h.quote?.sparkline ?? []}
                    width={72}
                    height={24}
                  />
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    h.quote
                      ? signedTone(h.quote.changePercent)
                      : "text-zinc-600"
                  )}
                >
                  {h.quote ? percent(h.quote.changePercent) : "—"}
                </div>
                <div className={cellBase}>
                  <button
                    type="button"
                    onClick={() => onDelete(h.id)}
                    className="rounded p-1 text-zinc-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
                    aria-label={`Delete ${h.ticker}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </FluidRow>
            ))}

            <FluidRow className="border-t border-zinc-700 bg-zinc-900/60 font-semibold">
              <div className={cn(cellBase, "py-2.5 text-white")}>PORTFOLIO</div>
              <div className={cn(cellBase, "py-2.5 tabular-nums text-zinc-400")}>
                100%
              </div>
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div
                className={cn(
                  cellBase,
                  "py-2.5 tabular-nums",
                  signedTone(totals.roiPct)
                )}
              >
                {percent(totals.roiPct)}
              </div>
              <div className={cn(cellBase, "py-2.5 tabular-nums text-zinc-300")}>
                {currency(totals.buyValue)}
              </div>
              <div className={cn(cellBase, "py-2.5 tabular-nums text-white")}>
                {currency(totals.currentValue)}
              </div>
              <div
                className={cn(
                  cellBase,
                  "py-2.5 tabular-nums",
                  signedTone(totals.roiDollar)
                )}
              >
                {currency(totals.roiDollar)}
              </div>
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
              <div className={cn(cellBase, "py-2.5")} />
            </FluidRow>
          </FluidTable>
        )}
      </div>
    </section>
  );
}
