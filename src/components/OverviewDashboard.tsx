"use client";

import { HomeWorld } from "@/components/HomeWorld";
import { CashAlertCard } from "@/components/mobile/CashAlertCard";
import { WatchlistStrip } from "@/components/WatchlistStrip";
import {
  BookNavChart,
  useBookNavHistory,
} from "@/components/mobile/GoldNavChart";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import {
  MicroLabel,
  NESTED_PAD,
  Panel,
  PanelHeader,
  InsightText,
  Reading,
  Score,
  Scoreboard,
  Segmented,
} from "@/components/ui/Panel";
import {
  currency,
  percent,
  signedCurrency,
  signedPercent,
  cn,
  plural,
  signedTone,
  cashtag,
} from "@/lib/format";
import { parseHoldingsPaste, type CsvHoldingRow } from "@/lib/csv-import";
import { buildMorningRead } from "@/lib/morning-read";
import type { UpsideAlert } from "@/lib/alerts";
import { statusLabel } from "@/lib/thesis-pulse";
import { sessionLabel, sessionKind } from "@/lib/market-session";
import { sheetCashBalance } from "@/lib/cash-balance";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import { recordWeekMark } from "@/lib/week-marks";
import type { CoveredCallRow } from "@/lib/types";
import {
  captureVisitSnapshot,
  diffSinceLastVisit,
  loadVisitSnapshot,
  saveVisitSnapshot,
  type VisitDiff,
} from "@/lib/visit-diff";
import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";

export type LabDeepLink = "seasonality";

/** Signed numbers use gain/loss. Neutral figures stay on the cream. */
const tone = (value: number | null | undefined) =>
  signedTone(value, "text-foreground/80");

/** Enough to see the shape of the day. Eight was a wall of cards. */
const MOVERS_SHOWN = 5;

type Props = {
  model: OverviewModel;
  onOpenSheet: (portfolioId: string, focus?: "covered-calls") => void;
  coveredCallRows?: CoveredCallRow[];
  /** Book-wide, not-yet-dismissed alerts (earnings/strike/margin/concentration). */
  activeAlerts?: UpsideAlert[];
  onOpenLab?: (tab?: LabDeepLink) => void;
  onOpenPulse?: (ticker?: string) => void;
  onOpenCompound?: () => void;
  marketState?: string | null;
  guest?: boolean;
  /** Show Fund + Communities on home (signed-in My book). */
  showCommunities?: boolean;
  /** Viewer has not opted into options. Hide every covered-call mention. */
  hideOptions?: boolean;
  /** Add a holding. Shown on the empty first-run card and on Home. */
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
  onPasteHoldings?: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
  /** Empty classroom homework sheet, not a personal book. */
  homework?: boolean;
  homeworkCash?: number;
};

/**
 * What a brand-new account sees instead of a hero reading $0 followed by a
 * column of "No green names yet" placeholders. Every route into the app
 * starts here, so it has to answer "what do I do now" rather than render
 * an analytics page with nothing in it.
 */
function EmptyBook({
  onAddHolding,
  onImportScreenshot,
  onImportCsv,
  onPasteHoldings,
  homework = false,
  homeworkCash,
}: {
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
  onPasteHoldings?: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  homework?: boolean;
  homeworkCash?: number;
}) {
  const [paste, setPaste] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const routes = (
    homework
      ? [
          {
            key: "manual",
            label: "Buy a name with paper money",
            onClick: onAddHolding,
            primary: true,
          },
        ]
      : [
          {
            key: "csv",
            label: "Upload a CSV",
            onClick: onImportCsv,
            primary: false,
          },
          {
            key: "screenshot",
            label: "Import a screenshot",
            onClick: onImportScreenshot,
            primary: false,
          },
          {
            key: "manual",
            label: "Add one by hand",
            onClick: onAddHolding,
            primary: false,
          },
        ]
  ).filter((r) => r.onClick);

  function submitPaste() {
    const parsed = parseHoldingsPaste(paste);
    if (parsed.rows.length === 0) {
      setPasteErr(
        parsed.skipped[0]?.reason ??
          "Need lines like NBIS 500 85.10"
      );
      return;
    }
    setPasteErr(null);
    onPasteHoldings?.({
      rows: parsed.rows,
      cash: parsed.cash,
      replace: true,
    });
  }

  return (
    <Panel tone="brand" className="overview-fade">
      <h2 className="text-lg font-bold text-foreground">
        {homework ? "Your homework portfolio is empty." : "Your portfolio is empty."}
      </h2>
      {homework ? (
        <>
          <p className="mt-3 text-sm text-muted">
            This is paper class. Everyone started with the same cash. Buy
            names with that paper money. Do not paste a real portfolio in here.
          </p>
          {homeworkCash != null && homeworkCash > 0 ? (
            <p className="mt-2 text-sm text-muted">
              You have {currency(homeworkCash, 0)} sitting ready.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            Paste what you own. One name per line: ticker, shares, cost.
          </p>
          <p className="mt-3 text-sm text-muted">
            This portfolio is only yours until you invite someone.
          </p>
        </>
      )}

      {!homework && onPasteHoldings && (
        <div className="mt-8 space-y-3">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"NBIS 500 85.10\nCRWV 1100 64.45"}
            className="w-full rounded-xl border border-border bg-well px-3 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted focus:border-brand"
          />
          {pasteErr && <p className="text-sm text-loss">{pasteErr}</p>}
          <button
            type="button"
            onClick={submitPaste}
            disabled={!paste.trim()}
            className="btn-primary disabled:opacity-40"
          >
            Add these names
          </button>
        </div>
      )}

      {routes.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {routes.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className={cn(
                "group rounded-xl border text-left transition active:scale-[0.99]",
                NESTED_PAD,
                r.primary
                  ? "border-brand/40 bg-hover hover:border-brand hover:bg-hover"
                  : "border-border bg-raised hover:border-border hover:bg-well/70"
              )}
            >
              <p className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                {r.label}
                <ArrowRight
                  className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                  aria-hidden
                />
              </p>
            </button>
          ))}
        </div>
      )}

    </Panel>
  );
}

function signedMovePct(pct: number): string {
  const n = percent(Math.abs(pct));
  if (pct > 0) return `+${n}`;
  if (pct < 0) return `-${n}`;
  return n;
}

function MorningStack({
  morning,
  previousAt,
  onOpenPulse,
  className,
}: {
  morning: ReturnType<typeof buildMorningRead>;
  previousAt: string | null;
  onOpenPulse?: (ticker?: string) => void;
  className?: string;
}) {
  const sunday = morning.sunday;
  return (
    <div className={cn("space-y-5", className)}>
      {sunday ? (
        <div className="space-y-4">
          <Reading label="Sunday">
            {morning.sentence}
          </Reading>
          <MicroLabel>Sunday look</MicroLabel>
          {(sunday.best || sunday.worst) && (
            <Scoreboard cols={sunday.best && sunday.worst ? 2 : 1}>
              {sunday.best && (
                <Score
                  label={cashtag(sunday.best.ticker)}
                  value={signedMovePct(sunday.best.pct)}
                  sub="Biggest week move"
                  valueClassName={tone(sunday.best.pct)}
                />
              )}
              {sunday.worst && (
                <Score
                  label={cashtag(sunday.worst.ticker)}
                  value={signedMovePct(sunday.worst.pct)}
                  sub="Biggest drop"
                  valueClassName={tone(sunday.worst.pct)}
                />
              )}
            </Scoreboard>
          )}
        </div>
      ) : (
        <>
          {!morning.afterClose &&
            (morning.quiet || morning.drivers.length === 0) && (
            <p className="text-base leading-relaxed text-foreground">
              {morning.sentence}
            </p>
          )}
          {!morning.quiet && morning.drivers.length > 0 && (
            <Scoreboard
              cols={
                morning.drivers.length === 1
                  ? 1
                  : morning.drivers.length === 2
                    ? 2
                    : 3
              }
            >
              {morning.drivers.map((d) => (
                <Score
                  key={d.ticker}
                  label={cashtag(d.ticker)}
                  value={signedCurrency(d.dollar, 0)}
                  sub={
                    d.share != null
                      ? `${Math.round(d.share * 100)}% of today's move`
                      : undefined
                  }
                  valueClassName={tone(d.dollar)}
                  subClassName={tone(d.dollar)}
                />
              ))}
            </Scoreboard>
          )}
        </>
      )}
      {morning.awayLines.length > 0 && (
        <Reading
          label={
            previousAt
              ? `Since you last looked · ${new Date(previousAt).toLocaleString(
                  "en-GB",
                  {
                    timeZone: "Europe/Tallinn",
                    dateStyle: "medium",
                    timeStyle: "short",
                  }
                )}`
              : "Since you last looked"
          }
        >
          <ul className="space-y-2">
            {morning.awayLines.map((line) => (
              <li
                key={line.id}
                className={
                  line.tone === "up"
                    ? "text-gain"
                    : line.tone === "down"
                      ? "text-loss"
                      : undefined
                }
              >
                {line.text}
              </li>
            ))}
          </ul>
        </Reading>
      )}
      {morning.notices.length > 0 && (
        <div
          className={cn(
            "grid gap-3",
            morning.notices.length > 1 && "sm:grid-cols-2"
          )}
        >
          {morning.notices.map((notice) => (
            <Reading key={notice.label} label={notice.label}>
              <InsightText text={notice.text} />
            </Reading>
          ))}
        </div>
      )}
      {morning.pulseFlags.length > 0 && (
        <div className="space-y-2">
          {morning.pulseFlags.map((flag) => (
            <button
              key={flag.ticker}
              type="button"
              onClick={() => onOpenPulse?.(flag.ticker)}
              className="w-full rounded-xl border border-border bg-raised px-3.5 py-3 text-left"
            >
              <MicroLabel>
                Pulse · {cashtag(flag.ticker)} · {statusLabel(flag.status)}
              </MicroLabel>
              <p className="mt-1.5 text-base leading-relaxed text-foreground">
                {flag.line}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MoverTile({
  ticker,
  mode,
  onOpen,
}: {
  ticker: TickerScore;
  mode: "win" | "loss" | "today-win" | "today-loss";
  onOpen: () => void;
}) {
  const lifetime = mode === "win" || mode === "loss";
  const isUp = mode === "win" || mode === "today-win";
  const pct = lifetime ? ticker.roiPct : ticker.todayPct;
  const dollars = lifetime ? ticker.roiDollar : ticker.todayDollar;
  const sheets = ticker.portfolios.filter(Boolean).join(", ");

  return (
    <button
      type="button"
      onClick={onOpen}
      title={sheets || undefined}
      className="relative flex min-h-11 h-full w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-xl border border-border bg-raised py-3.5 pl-5 pr-3 text-left transition hover:border-brand/40 hover:bg-hover sm:gap-3 sm:pr-4"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          isUp ? "bg-gain" : "bg-loss"
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-heading text-base font-bold text-foreground">
          {cashtag(ticker.ticker)}
        </span>
        <span className="mt-0.5 block font-sans text-sm tabular-nums text-muted">
          {currency(ticker.price)}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right">
        <span
          className={cn(
            "block font-sans text-base font-semibold tabular-nums",
            tone(pct)
          )}
        >
          {pct != null ? percent(pct, lifetime ? 1 : 2) : "—"}
        </span>
        <span className={cn("mt-0.5 block text-sm tabular-nums", tone(dollars))}>
          {signedCurrency(dollars, 0)}
        </span>
      </span>
    </button>
  );
}

function PortfolioLane({
  sheet,
  maxValue,
  onOpen,
}: {
  sheet: SheetScore;
  maxValue: number;
  onOpen: () => void;
}) {
  const width =
    maxValue > 0 ? Math.max(10, (sheet.totalValue / maxValue) * 100) : 10;
  const hot = sheet.roiPct >= 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full min-h-11 rounded-xl border border-border bg-hover/60 p-5 text-left transition hover:border-brand/40 hover:bg-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-base font-bold text-foreground">
            {sheet.portfolio.name}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {plural(sheet.holdingCount, "holding")}
            {sheetCashBalance(sheet.portfolio) !== 0
              ? ` · ${currency(sheetCashBalance(sheet.portfolio), 0)} cash`
              : ""}
          </p>
        </div>
        <p className="shrink-0 text-right font-sans text-lg font-semibold tabular-nums text-foreground">
          {currency(sheet.totalValue, 0)}
        </p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-hover">
        <div
          className={cn(
            "overview-bar h-full rounded-full",
            hot ? "bg-gain" : "bg-loss"
          )}
          style={{ width: `${width}%` }}
        />
      </div>

      <p className="mt-3 text-sm tabular-nums text-muted">
        <span className={tone(sheet.roiPct)}>{percent(sheet.roiPct)}</span>
        {" all time"}
        {sheet.todayDollar !== 0 ? (
          <>
            {" · "}
            <span className={tone(sheet.todayDollar)}>
              {signedCurrency(sheet.todayDollar)}
            </span>
            {" today"}
          </>
        ) : null}
      </p>
    </button>
  );
}

function OverviewYearChart({
  nav,
  liveNav,
  className,
}: {
  nav: ReturnType<typeof useBookNavHistory>;
  liveNav: number;
  className?: string;
}) {
  return (
    <WidgetErrorBoundary name="Year chart">
      <BookNavChart
        points={nav.points}
        assumed={nav.assumed}
        anchored={nav.anchored}
        anchor={nav.anchor}
        liveNav={liveNav}
        loading={nav.loading}
        firstRealDate={nav.firstRealDate}
        onDiscardAssumed={nav.discardAssumed}
        onRestoreAssumed={nav.restoreAssumed}
        onApplyAnchor={nav.applyAnchor}
        onClearAnchor={nav.clearAnchor}
        className={className}
      />
    </WidgetErrorBoundary>
  );
}

export function OverviewDashboard({
  model,
  onOpenSheet,
  activeAlerts = [],
  onOpenPulse,
  marketState = null,
  onAddHolding,
  onImportScreenshot,
  onImportCsv,
  onPasteHoldings,
  onOpenCash,
  onOpenAlerts,
  showCommunities = false,
  homework = false,
  homeworkCash,
}: Props) {
  const {
    totals,
    sheets,
    winners,
    losers,
    todayWinners,
    todayLosers,
    tickers,
  } = model;
  const maxSheet = Math.max(...sheets.map((s) => s.totalValue), 1);
  const [visitDiff, setVisitDiff] = useState<VisitDiff | null>(null);
  const [moverHorizon, setMoverHorizon] = useState<"today" | "lifetime">(
    "today"
  );
  const kind = sessionKind(marketState);

  const tickerKey = tickers.map((t) => t.ticker).join(",");

  useEffect(() => {
    if (!model.tickers.length || model.totals.todayPct == null) return;
    const best = [...model.tickers].sort(
      (a, b) => (b.todayPct ?? -99) - (a.todayPct ?? -99)
    )[0];
    const worst = [...model.tickers].sort(
      (a, b) => (a.todayPct ?? 99) - (b.todayPct ?? 99)
    )[0];
    recordWeekMark({
      totalValue: model.totals.totalValue,
      todayDollar: model.totals.todayDollar,
      bestTicker: best?.ticker ?? null,
      bestPct: best?.todayPct ?? null,
      worstTicker: worst?.ticker ?? null,
      worstPct: worst?.todayPct ?? null,
    });
  }, [tickerKey, model.totals.totalValue, model.totals.todayDollar, model.totals.todayPct, model.tickers]);

  useLayoutEffect(() => {
    if (!model.tickers.length) return;
    const prev = loadVisitSnapshot();
    setVisitDiff(prev ? diffSinceLastVisit(prev, model) : null);
    // Snapshot is written when you leave, not on every Overview paint
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey]);

  useEffect(() => {
    function persist() {
      if (!model.tickers.length) return;
      saveVisitSnapshot(captureVisitSnapshot(model));
    }
    function onVis() {
      if (document.visibilityState === "hidden") persist();
    }
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey, model.totals.totalValue, model.totals.cash]);

  const morning = useMemo(
    () => buildMorningRead(model, visitDiff, kind),
    [model, visitDiff, kind]
  );

  const nav = useBookNavHistory({
    liveNav: totals.totalValue,
    cash: totals.cash,
    positions: model.tickers.map((t) => ({
      ticker: t.ticker,
      shares: t.shares,
    })),
  });

  const movers = useMemo(() => {
    if (moverHorizon === "today") {
      return [
        ...todayWinners.map((t) => ({ t, mode: "today-win" as const })),
        ...todayLosers.map((t) => ({ t, mode: "today-loss" as const })),
      ]
        .sort(
          (a, b) => Math.abs(b.t.todayPct ?? 0) - Math.abs(a.t.todayPct ?? 0)
        )
        .slice(0, MOVERS_SHOWN);
    }
    return [
      ...winners.map((t) => ({ t, mode: "win" as const })),
      ...losers.map((t) => ({ t, mode: "loss" as const })),
    ]
      .sort((a, b) => Math.abs(b.t.roiPct) - Math.abs(a.t.roiPct))
      .slice(0, MOVERS_SHOWN);
  }, [moverHorizon, todayWinners, todayLosers, winners, losers]);

  const multiSheet = sheets.length > 1;

  function openFirstPortfolio(t: TickerScore) {
    const id = t.portfolioIds[0];
    if (id) onOpenSheet(id);
  }

  const bookIsEmpty = model.tickers.length === 0;
  const painted = nav.points.filter((p) => Number.isFinite(p.nav));
  const startNav = painted[0]?.nav;
  const endNav = painted[painted.length - 1]?.nav;
  const yearPct =
    startNav != null && startNav > 0 && endNav != null
      ? (endNav - startNav) / startNav
      : null;
  const yearDollar =
    startNav != null && endNav != null ? endNav - startNav : null;

  if (bookIsEmpty) {
    return (
      <div className="space-y-5 md:space-y-10">
        <EmptyBook
          onAddHolding={onAddHolding}
          onImportScreenshot={onImportScreenshot}
          onImportCsv={onImportCsv}
          onPasteHoldings={onPasteHoldings}
          homework={homework}
          homeworkCash={homeworkCash}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 md:space-y-10">
      {/* Desktop: one opening screen. Phone: same parts, one idea per card,
          so the stack matches Movers / portfolios / Watching. */}
      <Panel className="overview-fade">
        <PanelHeader
          hero
          title={morning.moveLabel}
          actions={
            <>
              <span
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted"
                title={sessionLabel(marketState)}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    kind === "open"
                      ? "bg-gain"
                      : kind === "pre" || kind === "ah"
                        ? "bg-mustard"
                        : "bg-muted"
                  )}
                  aria-hidden
                />
                {sessionLabel(marketState)}
              </span>
              {onAddHolding && (
                <span className="hidden md:inline-flex">
                  <button
                    type="button"
                    onClick={onAddHolding}
                    className="btn-primary"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a holding
                  </button>
                </span>
              )}
            </>
          }
        />

        <Scoreboard className="mt-5">
          <Score
            label="Portfolio"
            value={currency(totals.totalValue, 0)}
            sub={plural(totals.sheetCount, "portfolio")}
          />
          <Score
            label={morning.moveLabel}
            value={signedCurrency(totals.todayDollar)}
            sub={totals.todayPct != null ? percent(totals.todayPct) : "—"}
            valueClassName={tone(totals.todayDollar)}
            subClassName={tone(totals.todayDollar)}
          />
          <Score
            label="All time"
            value={signedCurrency(totals.roiDollar)}
            sub={
              <>
                <span className="md:hidden">{percent(totals.roiPct)}</span>
                <span className="hidden md:inline">
                  {percent(totals.roiPct)} vs cost you typed
                </span>
              </>
            }
            valueClassName={tone(totals.roiDollar)}
            subClassName={tone(totals.roiDollar)}
          />
          <Score
            label="Cash"
            value={currency(totals.cash, 0)}
            sub={totals.cash < 0 ? "Borrowed" : undefined}
            valueClassName={totals.cash < 0 ? "text-loss" : undefined}
            subClassName={totals.cash < 0 ? "text-loss" : undefined}
          />
        </Scoreboard>

        {onAddHolding && (
          <div className="mt-5 md:hidden">
            <button
              type="button"
              onClick={onAddHolding}
              className="btn-primary w-full"
            >
              <Plus className="h-3.5 w-3.5" />
              Add a holding
            </button>
          </div>
        )}

        <MorningStack
          className="mt-5 hidden md:block"
          morning={morning}
          previousAt={visitDiff?.previousAt ?? null}
          onOpenPulse={onOpenPulse}
        />

        <OverviewYearChart
          nav={nav}
          liveNav={totals.totalValue}
          className="mt-5 hidden md:block"
        />
      </Panel>

      <Panel className="overview-fade md:hidden">
        <PanelHeader
          title="This year"
          actions={
            yearPct != null && yearDollar != null ? (
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  tone(yearPct)
                )}
              >
                {signedPercent(yearPct)}
                <span className="font-medium text-muted">
                  {" "}
                  · {signedCurrency(yearDollar, 0)}
                </span>
              </p>
            ) : null
          }
        />
        <OverviewYearChart
          nav={nav}
          liveNav={totals.totalValue}
          className="mt-4"
        />
      </Panel>

      <Panel className="overview-fade md:hidden">
        <MorningStack
          morning={morning}
          previousAt={visitDiff?.previousAt ?? null}
          onOpenPulse={onOpenPulse}
        />
      </Panel>

      <CashAlertCard
        className="md:hidden"
        cash={totals.cash}
        alerts={activeAlerts}
        onOpenCash={onOpenCash}
        onOpenAlerts={onOpenAlerts}
      />

      <Panel className="overview-fade">
        <PanelHeader
          title="Movers"
          actions={
            <Segmented
              options={[
                { id: "today", label: morning.moveLabel },
                { id: "lifetime", label: "All time" },
              ]}
              value={moverHorizon}
              onChange={setMoverHorizon}
              ariaLabel="Mover time range"
            />
          }
        />
        <div className="mt-5">
          {movers.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted">
              Waiting on prices.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {movers.map(({ t, mode }) => (
                <MoverTile
                  key={`${mode}-${t.ticker}`}
                  ticker={t}
                  mode={mode}
                  onOpen={() => openFirstPortfolio(t)}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {multiSheet && (
        <Panel className="overview-fade">
          <PanelHeader title="Your portfolios" />
          <div className="mt-6 space-y-4">
            {sheets.map((sheet) => (
              <PortfolioLane
                key={sheet.portfolio.id}
                sheet={sheet}
                maxValue={maxSheet}
                onOpen={() => onOpenSheet(sheet.portfolio.id)}
              />
            ))}
          </div>
        </Panel>
      )}

      <Panel className="overview-fade">
        <WatchlistStrip
          heldTickers={tickers.map((t) => t.ticker)}
          onOpenPulse={onOpenPulse}
        />
      </Panel>

      {showCommunities ? (
        <WidgetErrorBoundary name="Around Upside Lab">
          <HomeWorld />
        </WidgetErrorBoundary>
      ) : null}
    </div>
  );
}
