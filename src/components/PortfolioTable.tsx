"use client";

import { cn, currency, percent } from "@/lib/format";
import {
  blockWheelChange,
  formatDecimal,
  parseDecimal,
} from "@/lib/number-input";
import type { EnrichedHolding, Portfolio } from "@/lib/types";
import { Trash2 } from "lucide-react";
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
}: {
  value: number;
  digits?: number;
  onCommit: (n: number) => void;
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
      className="no-spinner mx-auto w-[5.25rem] rounded px-1 py-0.5 text-center tabular-nums text-zinc-100 outline-none hover:bg-zinc-800/50 focus:bg-zinc-900 focus:ring-1 focus:ring-emerald-500/40"
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
}: Props) {
  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <header className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Holdings</h2>
      </header>

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
            <div className={cn(cellBase, "font-semibold tracking-wide text-white")}>
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
                h.quote ? signedTone(h.quote.changePercent) : "text-zinc-600"
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
    </section>
  );
}
