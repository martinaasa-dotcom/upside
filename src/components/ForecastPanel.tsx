"use client";

import { FluidRow, FluidTable, cellBase } from "@/components/FluidTable";
import { cn, currency, percent } from "@/lib/format";
import type { ForecastModel } from "@/lib/forecast";

type Props = {
  model: ForecastModel;
};

function signedTone(value: number) {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-rose-400";
  return "text-zinc-300";
}

function yearLabel(year: number) {
  return `EOY ${year}`;
}

export function ForecastPanel({ model }: Props) {
  const yearCols = model.years;
  // Current + years + Gain
  const template = `minmax(4.5rem, 0.7fr) minmax(5.5rem, 1fr) ${yearCols
    .map(() => "minmax(5.5rem, 1fr)")
    .join(" ")} minmax(4rem, 0.7fr)`;

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
      <header className="border-b border-zinc-800/80 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Forecast</h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          Stock price targets · portfolio totals = current shares × forecasted
          SP · next {yearCols.length} years
        </p>
      </header>

      {model.rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-zinc-500">
          Add holdings to project EOY prices.
        </div>
      ) : (
        <>
          {/* Mobile */}
          <div className="space-y-2 p-3 md:hidden">
            {model.rows.map((r) => (
              <div
                key={r.ticker}
                className="rounded-xl border border-zinc-800 bg-zinc-900/30 px-3 py-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-white">
                      {r.ticker}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {r.shares.toLocaleString("en-US")} shares
                      {!r.hasTargets && " · flat (no house target)"}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-sm font-medium tabular-nums",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-zinc-600"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : "—"}
                  </p>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-zinc-500">Current SP</p>
                    <p className="tabular-nums text-zinc-100">
                      {currency(r.currentPrice)}
                    </p>
                  </div>
                  {yearCols.map((y) => (
                    <div key={y}>
                      <p className="text-zinc-500">{yearLabel(y)}</p>
                      <p className="tabular-nums text-zinc-100">
                        {currency(r.eoyPrices[y])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Portfolio value
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                {currency(model.currentTotal)}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {yearCols.map((y) => (
                  <div key={y}>
                    <p className="text-zinc-500">{yearLabel(y)}</p>
                    <p className="tabular-nums text-zinc-100">
                      {currency(model.eoyTotals[y])}
                    </p>
                  </div>
                ))}
              </div>
              {model.gainPct != null && (
                <p
                  className={cn(
                    "mt-3 text-sm font-medium tabular-nums",
                    signedTone(model.gainPct)
                  )}
                >
                  To {yearCols[yearCols.length - 1]} · {percent(model.gainPct)}
                </p>
              )}
            </div>
          </div>

          {/* Desktop */}
          <div className="hidden overflow-x-auto md:block">
            <FluidTable template={template}>
              <FluidRow className="border-zinc-800 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <div className={cellBase}>Ticker</div>
                <div className={cellBase}>Current SP</div>
                {yearCols.map((y) => (
                  <div key={y} className={cellBase}>
                    {yearLabel(y)}
                  </div>
                ))}
                <div className={cellBase}>Gain</div>
              </FluidRow>

              {model.rows.map((r) => (
                <FluidRow key={r.ticker} className="hover:bg-zinc-900/40">
                  <div
                    className={cn(
                      cellBase,
                      "font-semibold tracking-wide text-white"
                    )}
                  >
                    {r.ticker}
                  </div>
                  <div className={cn(cellBase, "tabular-nums text-zinc-100")}>
                    {currency(r.currentPrice)}
                  </div>
                  {yearCols.map((y) => (
                    <div
                      key={y}
                      className={cn(
                        cellBase,
                        "tabular-nums",
                        r.hasTargets ? "text-zinc-100" : "text-zinc-500"
                      )}
                    >
                      {currency(r.eoyPrices[y])}
                    </div>
                  ))}
                  <div
                    className={cn(
                      cellBase,
                      "tabular-nums font-medium",
                      r.gainPct != null
                        ? signedTone(r.gainPct)
                        : "text-zinc-600"
                    )}
                  >
                    {r.gainPct != null ? percent(r.gainPct) : "—"}
                  </div>
                </FluidRow>
              ))}

              <FluidRow className="border-t border-zinc-700 bg-zinc-900/60 font-semibold">
                <div className={cn(cellBase, "py-2.5 text-white")}>
                  Portfolio
                </div>
                <div
                  className={cn(cellBase, "py-2.5 tabular-nums text-white")}
                >
                  {currency(model.currentTotal)}
                </div>
                {yearCols.map((y) => (
                  <div
                    key={y}
                    className={cn(cellBase, "py-2.5 tabular-nums text-white")}
                  >
                    {currency(model.eoyTotals[y])}
                  </div>
                ))}
                <div
                  className={cn(
                    cellBase,
                    "py-2.5 tabular-nums",
                    model.gainPct != null
                      ? signedTone(model.gainPct)
                      : "text-zinc-600"
                  )}
                >
                  {model.gainPct != null ? percent(model.gainPct) : "—"}
                </div>
              </FluidRow>
            </FluidTable>
          </div>
        </>
      )}

      <div className="border-t border-zinc-800/80 px-4 py-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Trim / add by year
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {model.suggestions.map((s) => (
            <div
              key={s.year}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-3"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400/90">
                {s.year}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">{s.theme}</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                <span className="font-medium text-emerald-300/90">Add</span>{" "}
                {s.add}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                <span className="font-medium text-rose-300/90">Trim</span>{" "}
                {s.trim}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
