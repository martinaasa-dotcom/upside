"use client";

import { HomeWorld } from "@/components/HomeWorld";
import { CashAlertCard } from "@/components/mobile/CashAlertCard";
import { WatchlistStrip } from "@/components/WatchlistStrip";
import {
  BookNavChart,
  useBookNavHistory,
  type NavPoint,
} from "@/components/mobile/GoldNavChart";
import {
  Panel,
  PanelHeader,
  Segmented,
  Stat,
} from "@/components/ui/Panel";
import {
  currency,
  percent,
  signedCurrency,
  cn,
  plural,
  signedTone,
  cashtag,
} from "@/lib/format";
import { parseHoldingsPaste, type CsvHoldingRow } from "@/lib/csv-import";
import { buildMorningRead } from "@/lib/morning-read";
import type { HomeSheetId } from "@/lib/home-sheet";
import type { UpsideAlert } from "@/lib/alerts";
import { statusLabel } from "@/lib/thesis-pulse";
import { sessionLabel, sessionKind } from "@/lib/market-session";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import { loadVisitStreak } from "@/lib/visit-streak";
import { recordWeekMark } from "@/lib/week-marks";
import type { CoveredCallRow } from "@/lib/types";
import {
  captureVisitSnapshot,
  diffSinceLastVisit,
  loadVisitSnapshot,
  saveVisitSnapshot,
  type VisitDiff,
} from "@/lib/visit-diff";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type LabDeepLink = "seasonality";

/** Overview sits on a dark field. Zinc-400 disappears; zinc-300 still reads. */
const tone = (value: number | null | undefined) =>
  signedTone(value, "text-zinc-300");

/** Enough to see the shape of the day. Eight was a wall of cards. */
const MOVERS_SHOWN = 5;

type Props = {
  model: OverviewModel;
  onOpenSheet: (portfolioId: string, focus?: "covered-calls") => void;
  coveredCallRows?: CoveredCallRow[];
  /** Book-wide, not-yet-dismissed alerts (earnings/strike/margin/concentration). */
  activeAlerts?: UpsideAlert[];
  onOpenLab?: (tab?: LabDeepLink) => void;
  onOpenPulse?: () => void;
  onOpenCompound?: () => void;
  marketState?: string | null;
  guest?: boolean;
  /** Show Fund + Communities on home (signed-in My book). */
  showCommunities?: boolean;
  /** Viewer has not opted into options. Hide every covered-call mention. */
  hideOptions?: boolean;
  /** First-run actions, shown only while the book is completely empty. */
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
  onPasteHoldings?: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  onAskMargus?: () => void;
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
  homeSheetId?: HomeSheetId;
  homeSheets?: Array<{ id: string; name: string }>;
  onHomeSheet?: (id: HomeSheetId) => void;
};

function MobileHomeHero({
  totals,
  alerts,
  points,
  assumed,
  loading,
  firstRealDate,
  onDiscardAssumed,
  onRestoreAssumed,
  onOpenCash,
  onOpenAlerts,
  morning,
  previousAt,
  onOpenPulse,
  streak,
  homeSheetId,
  homeSheets,
  onHomeSheet,
}: {
  totals: OverviewModel["totals"];
  alerts: UpsideAlert[];
  points: NavPoint[];
  assumed: boolean;
  loading: boolean;
  firstRealDate: string | null;
  onDiscardAssumed: () => void;
  onRestoreAssumed: () => void;
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
  morning: ReturnType<typeof buildMorningRead>;
  previousAt: string | null;
  onOpenPulse?: () => void;
  streak: number;
  homeSheetId: HomeSheetId;
  homeSheets: Array<{ id: string; name: string }>;
  onHomeSheet?: (id: HomeSheetId) => void;
}) {
  const up = totals.roiPct >= 0;
  return (
    <div className="md:hidden">
      <p className="text-sm text-muted">
        Book
        {streak >= 2 ? ` · ${streak}-day streak` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="font-logo text-4xl font-bold tabular-nums leading-none text-white">
          {currency(totals.totalValue, 0)}
        </p>
        <p
          className={cn(
            "mb-0.5 text-sm font-semibold tabular-nums",
            up ? "text-gain" : "text-loss"
          )}
        >
          {up ? "▲" : "▼"} {percent(Math.abs(totals.roiPct))}
        </p>
      </div>
      <p
        className={cn(
          "mt-2 text-sm tabular-nums",
          tone(totals.todayDollar)
        )}
      >
        {signedCurrency(totals.todayDollar, 0)} today
        {totals.todayPct != null ? ` · ${percent(totals.todayPct)}` : ""}
      </p>
      {onHomeSheet && homeSheets.length > 1 && (
        <HomeSheetChip
          className="mt-4"
          value={homeSheetId}
          sheets={homeSheets}
          onChange={onHomeSheet}
        />
      )}
      <MorningStack
        className="mt-5"
        morning={morning}
        previousAt={previousAt}
        onOpenPulse={onOpenPulse}
      />
      <div className="mt-8">
        <BookNavChart
          points={points}
          assumed={assumed}
          loading={loading}
          firstRealDate={firstRealDate}
          onDiscardAssumed={onDiscardAssumed}
          onRestoreAssumed={onRestoreAssumed}
        />
      </div>
      <CashAlertCard
        className="mt-8"
        cash={totals.cash}
        alerts={alerts}
        onOpenCash={onOpenCash}
        onOpenAlerts={onOpenAlerts}
      />
    </div>
  );
}

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
  onAskMargus,
}: {
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
  onPasteHoldings?: (input: {
    rows: CsvHoldingRow[];
    cash: number | null;
    replace: boolean;
  }) => void;
  onAskMargus?: () => void;
}) {
  const [paste, setPaste] = useState("");
  const [pasteErr, setPasteErr] = useState<string | null>(null);
  const routes = [
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
  ].filter((r) => r.onClick);

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
      <h2 className="text-lg font-semibold text-white sm:text-2xl">
        Your book is empty.
      </h2>
      <p className="mt-3 text-sm text-muted">
        Paste what you own. One name per line: ticker, shares, cost.
      </p>
      <p className="mt-2 text-xs text-zinc-500">
        This sheet is only yours until you share it with a circle.
      </p>

      {onPasteHoldings && (
        <div className="mt-6 space-y-2">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"NBIS 500 85.10\nCRWV 1100 64.45"}
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-white outline-none placeholder:text-zinc-600 focus:border-brand/50"
          />
          {pasteErr && <p className="text-xs text-rose-300">{pasteErr}</p>}
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
                "group rounded-xl border p-5 text-left transition active:scale-[0.99]",
                r.primary
                  ? "border-brand/40 bg-brand/10 hover:border-brand/70 hover:bg-brand/15"
                  : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70"
              )}
            >
              <p className="flex items-center gap-1.5 text-base font-semibold text-white">
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

      {onAskMargus && (
        <button
          type="button"
          onClick={onAskMargus}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-brand/50 hover:text-white"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Ask Margus first
        </button>
      )}
    </Panel>
  );
}

function HomeSheetChip({
  value,
  sheets,
  onChange,
  className,
}: {
  value: HomeSheetId;
  sheets: Array<{ id: string; name: string }>;
  onChange: (id: HomeSheetId) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs",
          value === "all"
            ? "border-brand/50 bg-brand/15 text-brand-bright"
            : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        )}
      >
        All sheets
      </button>
      {sheets.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onChange(s.id)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs",
            value === s.id
              ? "border-brand/50 bg-brand/15 text-brand-bright"
              : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          )}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function MorningStack({
  morning,
  previousAt,
  onOpenPulse,
  className,
}: {
  morning: ReturnType<typeof buildMorningRead>;
  previousAt: string | null;
  onOpenPulse?: () => void;
  className?: string;
}) {
  const special = Boolean(morning.sunday || morning.closeNote);
  return (
    <div className={cn("space-y-3", className)}>
      {morning.sunday ? (
        <div>
          <p className="text-sm font-semibold text-white">
            {morning.sunday.headline}
          </p>
          <ul className="mt-1.5 space-y-1">
            {morning.sunday.lines.map((line) => {
              const pulseLine =
                line.startsWith("Pulse:") ||
                line.startsWith("Last Pulse") ||
                line.startsWith("No Pulse");
              if (pulseLine && onOpenPulse) {
                return (
                  <li key={line}>
                    <button
                      type="button"
                      onClick={() => onOpenPulse()}
                      className="text-left text-sm text-zinc-200 hover:text-white"
                    >
                      {line}
                    </button>
                  </li>
                );
              }
              return (
                <li key={line} className="text-sm text-zinc-200">
                  {line}
                </li>
              );
            })}
          </ul>
        </div>
      ) : morning.closeNote ? (
        <div className="space-y-1">
          <p className="text-sm text-zinc-200">{morning.closeNote.book}</p>
          <p className="text-sm text-zinc-200">{morning.closeNote.loud}</p>
          {onOpenPulse ? (
            <button
              type="button"
              onClick={() => onOpenPulse()}
              className="text-left text-sm text-zinc-400 hover:text-zinc-200"
            >
              {morning.closeNote.pulse}
            </button>
          ) : (
            <p className="text-sm text-zinc-400">{morning.closeNote.pulse}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-zinc-200">{morning.sentence}</p>
      )}
      {morning.insight && (
        <p className="text-sm text-zinc-400">{morning.insight}</p>
      )}
      {!special && !morning.quiet && morning.drivers.length > 0 && (
        <ul className="space-y-1">
          {morning.drivers.map((d) => (
            <li
              key={d.ticker}
              className={cn("text-sm tabular-nums", tone(d.dollar))}
            >
              {cashtag(d.ticker)} {signedCurrency(d.dollar, 0)}
              {d.share != null
                ? ` · ${Math.round(d.share * 100)}% of the day's swing`
                : ""}
            </li>
          ))}
        </ul>
      )}
      {morning.awayLines.length > 0 && (
        <div>
          <p className="text-xs text-zinc-500">
            Since you last looked
            {previousAt
              ? ` · ${new Date(previousAt).toLocaleString("en-GB", {
                  timeZone: "Europe/Tallinn",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}`
              : ""}
          </p>
          <ul className="mt-1.5 space-y-1">
            {morning.awayLines.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "text-sm",
                  line.tone === "up"
                    ? "text-gain"
                    : line.tone === "down"
                      ? "text-loss"
                      : "text-zinc-300"
                )}
              >
                {line.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!special && morning.pulseFlag && (
        <button
          type="button"
          onClick={() => onOpenPulse?.()}
          className="w-full rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2.5 text-left"
        >
          <p className="text-xs uppercase tracking-wide text-amber-200/80">
            Pulse · {cashtag(morning.pulseFlag.ticker)} ·{" "}
            {statusLabel(morning.pulseFlag.status)}
          </p>
          <p className="mt-1 text-sm text-zinc-200">{morning.pulseFlag.line}</p>
        </button>
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
      className="relative grid min-h-11 w-full grid-cols-[minmax(4.5rem,1fr)_5.75rem_8.5rem] items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-app/40 py-3.5 pl-5 pr-4 text-left transition hover:border-brand/35 hover:bg-hover"
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5",
          isUp ? "bg-gain" : "bg-loss"
        )}
        aria-hidden
      />
      <span className="min-w-0 truncate font-heading text-base font-bold text-white">
        {cashtag(ticker.ticker)}
      </span>
      <span className="text-right font-heading text-base font-bold tabular-nums text-white">
        {currency(ticker.price)}
      </span>
      <span className="text-right">
        <span
          className={cn(
            "block font-heading text-base font-bold tabular-nums",
            tone(pct)
          )}
        >
          {pct != null ? percent(pct, lifetime ? 1 : 2) : "—"}
        </span>
        <span className={cn("mt-0.5 block text-sm tabular-nums", tone(dollars))}>
          {signedCurrency(dollars)}
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
      className="group w-full min-h-11 rounded-xl border border-white/10 bg-hover/60 px-4 py-4 text-left transition hover:border-brand/35 hover:bg-hover sm:px-5 sm:py-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-bold text-white group-hover:text-brand-bright">
            {sheet.portfolio.name}
          </p>
          <p className="mt-1.5 text-sm text-muted">
            {plural(sheet.holdingCount, "holding")}
            {sheet.portfolio.cash_balance !== 0
              ? ` · ${currency(sheet.portfolio.cash_balance, 0)} cash`
              : ""}
          </p>
        </div>
        <p className="shrink-0 text-right font-heading text-lg font-bold tabular-nums text-white">
          {currency(sheet.totalValue, 0)}
        </p>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800">
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
  onAskMargus,
  onOpenCash,
  onOpenAlerts,
  showCommunities = false,
  homeSheetId = "all",
  homeSheets = [],
  onHomeSheet,
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
  const [streak, setStreak] = useState(0);
  const kind = sessionKind(marketState);

  const tickerKey = tickers.map((t) => t.ticker).join(",");

  useEffect(() => {
    setStreak(loadVisitStreak().currentStreak);
  }, []);

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

  useEffect(() => {
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

  if (bookIsEmpty) {
    return (
      <div className="space-y-8">
        <EmptyBook
          onAddHolding={onAddHolding}
          onImportScreenshot={onImportScreenshot}
          onImportCsv={onImportCsv}
          onPasteHoldings={onPasteHoldings}
          onAskMargus={onAskMargus}
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <MobileHomeHero
        totals={totals}
        alerts={activeAlerts}
        points={nav.points}
        assumed={nav.assumed}
        loading={nav.loading}
        firstRealDate={nav.firstRealDate}
        onDiscardAssumed={nav.discardAssumed}
        onRestoreAssumed={nav.restoreAssumed}
        onOpenCash={onOpenCash}
        onOpenAlerts={onOpenAlerts}
        morning={morning}
        previousAt={visitDiff?.previousAt ?? null}
        onOpenPulse={onOpenPulse}
        streak={streak}
        homeSheetId={homeSheetId}
        homeSheets={homeSheets}
        onHomeSheet={onHomeSheet}
      />

      {/* One screen: where you stand, then what to make of it. */}
      <Panel className="overview-fade relative hidden overflow-hidden md:block">
        <div
          className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/12 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <PanelHeader
            hero
            title={streak >= 2 ? `Today · ${streak} days` : "Today"}
            actions={
              <>
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400"
                  title={sessionLabel(marketState)}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      kind === "open"
                        ? "bg-gain"
                        : kind === "pre" || kind === "ah"
                          ? "bg-amber-400"
                          : "bg-zinc-500"
                    )}
                    aria-hidden
                  />
                  {sessionLabel(marketState)}
                </span>
                {onAskMargus && (
                  <button
                    type="button"
                    onClick={onAskMargus}
                    className="btn-secondary"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Ask Margus
                  </button>
                )}
              </>
            }
          />

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Book"
              value={currency(totals.totalValue, 0)}
              sub={plural(totals.sheetCount, "sheet")}
            />
            <Stat
              label="Today"
              value={signedCurrency(totals.todayDollar)}
              sub={totals.todayPct != null ? percent(totals.todayPct) : "—"}
              valueClassName={tone(totals.todayDollar)}
              subClassName={tone(totals.todayDollar)}
            />
            <Stat
              label="All time"
              value={signedCurrency(totals.roiDollar)}
              sub={`${percent(totals.roiPct)} vs cost you typed`}
              valueClassName={tone(totals.roiDollar)}
              subClassName={tone(totals.roiDollar)}
            />
            <Stat
              label="Cash"
              value={currency(totals.cash, 0)}
              sub={totals.cash < 0 ? "Borrowed" : undefined}
              valueClassName={totals.cash < 0 ? "text-loss" : undefined}
              subClassName={totals.cash < 0 ? "text-loss" : undefined}
            />
          </div>

          {onHomeSheet && homeSheets.length > 1 && (
            <HomeSheetChip
              className="mt-4"
              value={homeSheetId}
              sheets={homeSheets}
              onChange={onHomeSheet}
            />
          )}

          <MorningStack
            className="mt-5"
            morning={morning}
            previousAt={visitDiff?.previousAt ?? null}
            onOpenPulse={onOpenPulse}
          />

          <BookNavChart
            points={nav.points}
            assumed={nav.assumed}
            loading={nav.loading}
            firstRealDate={nav.firstRealDate}
            onDiscardAssumed={nav.discardAssumed}
            onRestoreAssumed={nav.restoreAssumed}
            className="mt-6"
          />
        </div>
      </Panel>

      <Panel className="overview-fade">
        <PanelHeader
          title="Movers"
          actions={
            <Segmented
              options={[
                { id: "today", label: "Today" },
                { id: "lifetime", label: "All time" },
              ]}
              value={moverHorizon}
              onChange={setMoverHorizon}
              ariaLabel="Mover time range"
            />
          }
        />
        <div className="mt-6">
          {movers.length === 0 ? (
            <p className="py-5 text-center text-sm text-zinc-400">
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
          <PanelHeader title="Your sheets" />
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
          onOpenPulse={() => onOpenPulse?.()}
        />
      </Panel>

      {showCommunities ? <HomeWorld /> : null}
    </div>
  );
}
