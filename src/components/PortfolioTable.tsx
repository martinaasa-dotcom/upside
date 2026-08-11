"use client";

import { cn, currency, percent } from "@/lib/format";
import {
  usdToDisplay,
  formatEurUsdHint,
  type DisplayCurrency,
} from "@/lib/display-currency";
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
  onPatch: (patch: HoldingPatch) => void | boolean | Promise<void | boolean>;
  onDelete: (id: string) => void;
  onEditCash: () => void;
  onAddHolding?: () => void;
  onAskMargus?: () => void;
  onOpenTicker?: (ticker: string) => void;
  /** Sheet display currency for totals/values (spot & buy stay USD). */
  displayCurrency?: DisplayCurrency;
  /** USD per 1 EUR — required when displayCurrency is EUR. */
  eurUsd?: number | null;
  onDisplayCurrencyChange?: (currency: DisplayCurrency) => void;
};

function signedTone(value: number) {
  if (value > 0) return "text-gain";
  if (value < 0) return "text-loss";
  return "text-zinc-300";
}

function InlineNumber({
  value,
  digits = 0,
  /** How many decimals to show when blurred; commit still uses `digits`. */
  displayDigits,
  onCommit,
  className,
}: {
  value: number;
  digits?: number;
  displayDigits?: number;
  onCommit: (n: number) => void | boolean | Promise<void | boolean>;
  className?: string;
}) {
  const shownDigits = displayDigits ?? digits;
  const display = formatDecimal(value, shownDigits);
  // Focus shows true fractional value without trailing zeros (30 not 30.0000)
  const editDisplay =
    digits <= 0
      ? formatDecimal(value, 0)
      : String(Number(value.toFixed(digits)));
  const [draft, setDraft] = useState(display);
  const focused = useRef(false);
  const allowDecimal = digits > 0;

  useEffect(() => {
    if (!focused.current) setDraft(display);
  }, [display]);

  async function commit() {
    focused.current = false;
    const n = parseDecimal(draft);
    if (Number.isNaN(n)) {
      setDraft(display);
      return;
    }
    const rounded =
      digits <= 0
        ? Math.round(n)
        : Math.round(n * 10 ** digits) / 10 ** digits;
    if (rounded === value) {
      setDraft(display);
      return;
    }
    try {
      const ok = await onCommit(rounded);
      if (ok === false) setDraft(formatDecimal(value, shownDigits));
    } catch {
      setDraft(formatDecimal(value, shownDigits));
    }
  }

  return (
    <input
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={draft}
      onChange={(e) => {
        const next = allowDecimal
          ? e.target.value.replace(/,/g, ".").replace(/[^\d.-]/g, "")
          : e.target.value.replace(/[^\d-]/g, "");
        setDraft(next);
      }}
      onFocus={() => {
        focused.current = true;
        setDraft(editDisplay);
      }}
      onWheel={blockWheelChange}
      onBlur={() => {
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "inline-edit no-spinner rounded-t px-1 py-0.5 text-center tabular-nums text-zinc-100 outline-none hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-brand/40",
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
  onAskMargus,
  onOpenTicker,
  displayCurrency = "USD",
  eurUsd = null,
  onDisplayCurrencyChange,
}: Props) {
  const money = (usd: number, digits = 2) =>
    currency(usdToDisplay(usd, displayCurrency, eurUsd), digits, displayCurrency);
  const usd = (value: number, digits = 2) => currency(value, digits, "USD");

  const emptyCta = (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
      {onAskMargus && (
        <button
          type="button"
          onClick={onAskMargus}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-400 hover:text-white"
        >
          Import screenshot
        </button>
      )}
      {onAddHolding && (
        <button
          type="button"
          onClick={onAddHolding}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-[#121214] hover:bg-brand-bright"
        >
          <Plus className="h-4 w-4" />
          Add holding
        </button>
      )}
      {onAskMargus && (
        <button
          type="button"
          onClick={onAskMargus}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-400 hover:text-white"
        >
          Ask Margus
        </button>
      )}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-brand-deep/30 bg-[#161618]/70">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-white">Holdings</h2>
          {onDisplayCurrencyChange && (
            <div
              className="flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-0.5"
              title={
                eurUsd && eurUsd > 0
                  ? `Values convert via ${formatEurUsdHint(eurUsd)}. Spot stays USD.`
                  : "Totals & values · waiting for EURUSD"
              }
            >
              {(["USD", "EUR"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onDisplayCurrencyChange(code)}
                  className={cn(
                    "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                    displayCurrency === code
                      ? "bg-brand/20 text-brand-bright"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {code}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onEditCash}
          className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-zinc-900"
          title="Edit cash (stored in USD)"
        >
          <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Cash
          </span>
          <span
            className={cn(
              "text-sm font-semibold tabular-nums",
              signedTone(portfolio.cash_balance)
            )}
          >
            {money(portfolio.cash_balance)}
          </span>
        </button>
      </header>

      {/* Mobile cards */}
      <div className="space-y-2 p-3 md:hidden">
        {holdings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-8 text-center">
            <p className="text-sm text-zinc-400">No holdings on this sheet yet.</p>
            {emptyCta}
          </div>
        ) : (
          holdings.map((h) => (
            <div
              key={h.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-white">
                    {onOpenTicker ? (
                      <button
                        type="button"
                        onClick={() => onOpenTicker(h.ticker)}
                        className="hover:text-brand-bright"
                      >
                        {h.ticker}
                      </button>
                    ) : (
                      h.ticker
                    )}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {percent(h.pctOfTotal)} of book ·{" "}
                    {h.quote ? percent(h.quote.changePercent) : "—"} today
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDelete(h.id)}
                  className="rounded p-3.5 text-zinc-500 hover:bg-zinc-800 hover:text-rose-400"
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
                    digits={4}
                    displayDigits={0}
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
                    {usd(h.quote?.price ?? h.buy_price)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Value</p>
                  <p className="tabular-nums text-zinc-100">
                    {money(h.currentValue)}
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
                    {money(h.roiDollar)}
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
              <span>Value {money(totals.currentValue)}</span>
              <span className={signedTone(totals.roiDollar)}>
                {money(totals.roiDollar)}
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
            {emptyCta}
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

            {holdings.map((h) => (
              <FluidRow key={h.id} className="group hover:bg-zinc-900/40">
                <div
                  className={cn(
                    cellBase,
                    "font-semibold tracking-wide text-white"
                  )}
                >
                  {onOpenTicker ? (
                    <button
                      type="button"
                      onClick={() => onOpenTicker(h.ticker)}
                      className="hover:text-brand-bright"
                    >
                      {h.ticker}
                    </button>
                  ) : (
                    h.ticker
                  )}
                </div>
                <div className={cn(cellBase, "tabular-nums text-zinc-400")}>
                  {percent(h.pctOfTotal)}
                </div>
                <div className={cn(cellBase, "py-1")}>
                  <InlineNumber
                    value={h.shares}
                    digits={4}
                    displayDigits={0}
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
                  {usd(h.quote?.price ?? h.buy_price)}
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
                  {money(h.buyValue)}
                </div>
                <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                  {money(h.currentValue)}
                </div>
                <div
                  className={cn(
                    cellBase,
                    "tabular-nums font-medium",
                    signedTone(h.roiDollar)
                  )}
                >
                  {money(h.roiDollar)}
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
                {money(totals.buyValue)}
              </div>
              <div className={cn(cellBase, "py-2.5 tabular-nums text-white")}>
                {money(totals.currentValue)}
              </div>
              <div
                className={cn(
                  cellBase,
                  "py-2.5 tabular-nums",
                  signedTone(totals.roiDollar)
                )}
              >
                {money(totals.roiDollar)}
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
