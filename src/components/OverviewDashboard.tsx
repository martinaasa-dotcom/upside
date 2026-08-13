"use client";

import { Sparkline } from "@/components/Sparkline";
import { DailyDuelCard } from "@/components/DailyDuelCard";
import { CommunitiesSpotlight } from "@/components/CommunitiesSpotlight";
import {
  currency,
  percent,
  signedCurrency,
  cn,
  plural,
  signedTone,  cashtag,
} from "@/lib/format";

/** Overview sits on a darker surface, so flat reads better one step
 * dimmer than the shared default. */
const tone = (value: number | null | undefined) =>
  signedTone(value, "text-zinc-400");
import { buildInvestorBriefing, type BriefingLink } from "@/lib/investor-briefing";
import type { UpsideAlert } from "@/lib/alerts";
import { PULSE_REFRESH_MS } from "@/lib/thesis-pulse";
import {
  last7DaysStrip,
  streakFlavor,
  type VisitStreakState,
} from "@/lib/visit-streak";
import {
  sessionLabel,
  sessionShort,
  sessionKind,
} from "@/lib/market-session";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import type { CoveredCallRow } from "@/lib/types";
import { buildSheetRivalry, type RivalRow } from "@/lib/sheet-rivalry";
import {
  calendarDaysBetweenKeys,
  formatRelativeDays,
  todayKeyInTz,
} from "@/lib/timezone";
import {
  captureVisitSnapshot,
  diffSinceLastVisit,
  loadVisitSnapshot,
  saveVisitSnapshot,
  type VisitDiff,
} from "@/lib/visit-diff";
import {
  ArrowRight,
  CalendarDays,
  Info,
  Radar,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export type LabDeepLink = "seasonality";

type EarningsEvent = { ticker: string; date: string; days: number };

type Props = {
  model: OverviewModel;
  onOpenSheet: (portfolioId: string) => void;
  coveredCallRows?: CoveredCallRow[];
  /** Book-wide, not-yet-dismissed alerts (earnings/strike/margin/concentration). */
  activeAlerts?: UpsideAlert[];
  onOpenLab?: (tab?: LabDeepLink) => void;
  onOpenPulse?: () => void;
  onOpenCompound?: () => void;
  marketState?: string | null;
  guest?: boolean;
  /** Personal daily-visit streak — null for guests / before it loads. */
  visitStreak?: VisitStreakState | null;
  /** Show communities spotlight (signed-in My book Overview). */
  showCommunities?: boolean;
  /** Viewer has no options experience — keep copy options-free. */
  hideOptions?: boolean;
  /** First-run actions, shown only while the book is completely empty. */
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
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
}: {
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
}) {
  const routes = [
    {
      key: "screenshot",
      label: "Import a screenshot",
      detail:
        "Snap your broker's holdings page. Margus reads it and fills everything in.",
      hint: "Fastest",
      onClick: onImportScreenshot,
      primary: true,
    },
    {
      key: "csv",
      label: "Upload a CSV",
      detail: "Most brokers export one. Bring it over in a single go.",
      hint: "Best for big books",
      onClick: onImportCsv,
      primary: false,
    },
    {
      key: "manual",
      label: "Add one by hand",
      detail: "Ticker, shares, what you paid. Takes about ten seconds.",
      hint: "Just trying it out",
      onClick: onAddHolding,
      primary: false,
    },
  ].filter((r) => r.onClick);

  return (
    <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-gradient-to-b from-brand/10 to-[#161618]/60 p-5 sm:p-8">
      <h2 className="text-2xl font-semibold tracking-tight text-white">
        Your book is empty. Let&apos;s fix that.
      </h2>
      <p className="mt-2 max-w-xl text-base text-zinc-400">
        Add what you own and this page turns into your daily read: what moved,
        what needs attention, and what the numbers say about the way you
        invest.
      </p>

      {routes.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {routes.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className={cn(
                "group rounded-2xl border p-4 text-left transition active:scale-[0.99]",
                r.primary
                  ? "border-brand/40 bg-brand/10 hover:border-brand/70 hover:bg-brand/15"
                  : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70"
              )}
            >
              <span
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  r.primary ? "text-brand-bright" : "text-zinc-400"
                )}
              >
                {r.hint}
              </span>
              <p className="mt-1.5 flex items-center gap-1.5 text-base font-semibold text-white">
                {r.label}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {r.detail}
              </p>
            </button>
          ))}
        </div>
      )}

      <p className="mt-5 text-sm text-zinc-400">
        Nothing here is advice, and nothing you add is shared until you invite
        someone.
      </p>
    </section>
  );
}

function BriefingCard({
  kind,
  ticker,
  title,
  detail,
  link,
  cta,
  navigable,
  onNavigate,
}: {
  kind: "action" | "watch" | "play";
  ticker?: string;
  title: string;
  detail: string;
  link?: BriefingLink;
  cta?: string;
  navigable?: boolean;
  onNavigate?: (link: BriefingLink) => void;
}) {
  const canNavigate = Boolean(link && navigable && onNavigate);

  const shell = cn(
    "rounded-2xl border px-3.5 py-3 text-left transition",
    kind === "action"
      ? "border-amber-500/30 bg-amber-500/[0.07]"
      : kind === "play"
        ? "border-brand/30 bg-brand/10"
        : "border-zinc-800/80 bg-zinc-900/40",
    canNavigate &&
      "cursor-pointer hover:border-brand/40 hover:bg-zinc-900/70 active:scale-[0.995]"
  );

  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {kind}
        {ticker ? ` · ${cashtag(ticker)}` : ""}
      </p>
      <p className="mt-0.5 text-[15px] font-medium text-white">{title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{detail}</p>
      {canNavigate && cta && (
        <p className="mt-2 text-xs font-medium text-brand-bright">{cta}</p>
      )}
    </>
  );

  if (canNavigate && link) {
    return (
      <button
        type="button"
        className={cn(shell, "w-full")}
        onClick={() => onNavigate!(link)}
      >
        {body}
      </button>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * Tap/click-to-toggle info bubble — not hover-only, since hover doesn't
 * exist on touch devices and these hero numbers are the very first thing
 * a brand-new, possibly non-technical user sees.
 */
function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        onBlur={() => setOpen(false)}
        aria-label="What does this mean?"
        aria-expanded={open}
        className="inline-flex items-center justify-center p-1.5 text-zinc-400 hover:text-zinc-300"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1 w-44 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-normal leading-relaxed text-zinc-300 shadow-xl"
        >
          {text}
        </span>
      )}
    </span>
  );
}

function PortfolioChips({ names }: { names: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-sm text-zinc-300"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function RankCard({
  rank,
  ticker,
  mode,
  onOpen,
}: {
  rank: number;
  ticker: TickerScore;
  mode: "win" | "loss" | "today-win" | "today-loss";
  onOpen: () => void;
}) {
  const isUp = mode === "win" || mode === "today-win";
  const metric =
    mode === "win" || mode === "loss" ? ticker.roiPct : (ticker.todayPct ?? 0);
  const dollar =
    mode === "win" || mode === "loss" ? ticker.roiDollar : ticker.todayDollar;
  const dollarLabel =
    mode === "win" || mode === "loss" ? "lifetime" : "session";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-2xl border px-3 py-3 text-left transition hover:brightness-110 sm:gap-3 sm:px-4 sm:py-3.5",
        isUp
          ? "border-emerald-500/25 bg-emerald-500/[0.07]"
          : "border-rose-500/25 bg-rose-500/[0.07]"
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
          isUp
            ? "bg-emerald-500/20 text-emerald-300"
            : "bg-rose-500/20 text-rose-300"
        )}
      >
        {rank}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-semibold text-white sm:text-lg">
            {cashtag(ticker.ticker)}
          </span>
          <span className="text-xs text-zinc-400 sm:text-sm">
            {currency(ticker.currentValue, 0)}
          </span>
        </div>
        <PortfolioChips names={ticker.portfolios} />
        <div className="flex items-center gap-2.5 text-sm text-zinc-400">
          <span>{ticker.shares.toLocaleString("en-US")} sh</span>
          <Sparkline points={ticker.sparkline} width={64} height={18} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-lg font-bold tabular-nums sm:text-xl",
            tone(metric)
          )}
        >
          {percent(metric)}
        </div>
        <div className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-100 sm:text-base">
          {currency(ticker.price)}
        </div>
        <div
          className={cn(
            "mt-0.5 text-xs tabular-nums text-zinc-400",
            Math.abs(dollar) > 0.005 && tone(dollar)
          )}
          title={`${dollarLabel} P&L`}
        >
          {signedCurrency(dollar)}
        </div>
      </div>
    </button>
  );
}

function PortfolioLane({
  sheet,
  maxValue,
  onOpen,
  rival,
  rank,
}: {
  sheet: SheetScore;
  maxValue: number;
  onOpen: () => void;
  /** Blended standing among your sheets. Absent when there's only one
   * sheet, where "rank #1 of 1" would be noise. */
  rival?: RivalRow;
  rank?: number;
}) {
  const width =
    maxValue > 0 ? Math.max(8, (sheet.totalValue / maxValue) * 100) : 8;
  const hot = sheet.roiPct >= 0;

  return (
    <button type="button" onClick={onOpen} className="group w-full text-left">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 truncate text-lg font-semibold text-white group-hover:text-brand-bright">
            {rank != null && (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums",
                  rank === 1
                    ? "bg-brand/20 text-brand-bright"
                    : "bg-zinc-800 text-zinc-400"
                )}
              >
                {rank === 1 && <Trophy className="h-3 w-3" />}#{rank}
              </span>
            )}
            {sheet.portfolio.name}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {plural(sheet.holdingCount, "name")} · cash{" "}
            {currency(sheet.portfolio.cash_balance, 0)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-zinc-100">
            {currency(sheet.totalValue, 0)}
          </p>
          <p className={cn("mt-1 text-sm tabular-nums", tone(sheet.roiPct))}>
            {percent(sheet.roiPct)} · {signedCurrency(sheet.roiDollar)}
          </p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-zinc-800/80">
        <div
          className={cn(
            "overview-bar h-full rounded-full",
            hot
              ? "bg-gradient-to-r from-emerald-700 via-emerald-500 to-emerald-300"
              : "bg-gradient-to-r from-rose-700 via-rose-500 to-orange-400"
          )}
          style={{ width: `${width}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-sm text-zinc-400">
        <span>
          Today{" "}
          <span className={tone(sheet.todayDollar)}>
            {signedCurrency(sheet.todayDollar)}
          </span>
        </span>
        <span className={tone(sheet.todayPct ?? 0)}>
          {sheet.todayPct !== null ? percent(sheet.todayPct) : "—"}
        </span>
      </div>
      {rival && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800/60 pt-2 text-xs text-zinc-400">
          <span>
            Today <span className="text-zinc-300">#{rival.medals.today}</span>
          </span>
          <span>
            Lifetime <span className="text-zinc-300">#{rival.medals.roi}</span>
          </span>
          <span>
            Size <span className="text-zinc-300">#{rival.medals.nav}</span>
          </span>
        </div>
      )}
    </button>
  );
}

export function OverviewDashboard({
  model,
  onOpenSheet,
  coveredCallRows = [],
  activeAlerts = [],
  onOpenPulse,
  onOpenCompound,
  marketState = null,
  guest = false,
  visitStreak = null,
  showCommunities = false,
  hideOptions = false,
  onAddHolding,
  onImportScreenshot,
  onImportCsv,
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
  const [earnings, setEarnings] = useState<EarningsEvent[] | null>(null);
  const [visitDiff, setVisitDiff] = useState<VisitDiff | null>(null);
  const [moverHorizon, setMoverHorizon] = useState<"today" | "lifetime">(
    "today"
  );

  const tickerKey = tickers.map((t) => t.ticker).join(",");
  useEffect(() => {
    const list = tickerKey ? tickerKey.split(",") : [];
    if (!list.length) return;
    let cancelled = false;

    const load = () => {
      void fetch(`/api/market/events?tickers=${encodeURIComponent(tickerKey)}`)
        .then((r) => r.json())
        .then((data: { earnings?: EarningsEvent[] }) => {
          if (!cancelled) setEarnings(data.earnings ?? []);
        })
        .catch(() => {
          // Keep whatever was already loaded — a blip shouldn't blank the
          // upcoming-earnings list that's already on screen.
        });
    };

    load();
    // Hourly background refresh, no market-session gating — covers
    // pre-market and after-hours the same as regular trading hours. Skipped
    // while the tab is hidden; resumes on the next tick once visible again.
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, PULSE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tickerKey]);

  useEffect(() => {
    if (!model.tickers.length) return;
    const prev = loadVisitSnapshot();
    setVisitDiff(prev ? diffSinceLastVisit(prev, model) : null);
    // Snapshot is written when you leave — not on every Overview paint
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

  const upcomingEarnings = useMemo(() => {
    if (!earnings) return null;
    const today = todayKeyInTz();
    return earnings
      .map((e) => ({
        ...e,
        days: calendarDaysBetweenKeys(today, e.date),
      }))
      .filter((e) => e.days >= 0 && e.days <= 90)
      .sort((a, b) => a.days - b.days || a.ticker.localeCompare(b.ticker));
  }, [earnings]);

  const briefing = useMemo(
    () =>
      buildInvestorBriefing({
        model,
        activeAlerts,
        coveredCallRows,
        hideOptions,
        canReachPulse: !guest && Boolean(onOpenPulse),
      }),
    [model, activeAlerts, coveredCallRows, hideOptions, guest, onOpenPulse]
  );

  const movers = useMemo(() => {
    if (moverHorizon === "today") {
      return [
        ...todayWinners.map((t) => ({ t, mode: "today-win" as const })),
        ...todayLosers.map((t) => ({ t, mode: "today-loss" as const })),
      ]
        .sort(
          (a, b) =>
            Math.abs(b.t.todayPct ?? 0) - Math.abs(a.t.todayPct ?? 0)
        )
        .slice(0, 8);
    }
    return [
      ...winners.map((t) => ({ t, mode: "win" as const })),
      ...losers.map((t) => ({ t, mode: "loss" as const })),
    ]
      .sort((a, b) => Math.abs(b.t.roiPct) - Math.abs(a.t.roiPct))
      .slice(0, 8);
  }, [moverHorizon, todayWinners, todayLosers, winners, losers]);

  // Sheet standings fold straight into the Portfolios list below rather
  // than living in their own card: ranking your own sheets is the same
  // data the list already shows, just ordered.
  const rivalry = useMemo(() => buildSheetRivalry(model), [model]);
  const ranked = sheets.length > 1;
  const rivalById = useMemo(
    () => new Map(rivalry.map((r) => [r.id, r])),
    [rivalry]
  );
  const orderedSheets = useMemo(() => {
    if (!ranked) return sheets;
    const order = new Map(rivalry.map((r, i) => [r.id, i]));
    return [...sheets].sort(
      (a, b) =>
        (order.get(a.portfolio.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(b.portfolio.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [sheets, rivalry, ranked]);
  const kind = sessionKind(marketState);

  function openFirstPortfolio(t: TickerScore) {
    const id = t.portfolioIds[0];
    if (id) onOpenSheet(id);
  }

  function handleBriefingNavigate(link: BriefingLink) {
    if (link.type === "pulse") onOpenPulse?.();
    else if (link.type === "compound") onOpenCompound?.();
    else if (link.type === "sheet") onOpenSheet(link.portfolioId);
  }

  function canFollowBriefingLink(link?: BriefingLink): boolean {
    if (!link) return false;
    if (link.type === "pulse") return Boolean(onOpenPulse);
    if (link.type === "compound") return Boolean(onOpenCompound);
    return Boolean(link.portfolioId);
  }

  const bookIsEmpty = model.tickers.length === 0;

  return (
    <div className="space-y-6">
      {bookIsEmpty && (
        <EmptyBook
          onAddHolding={onAddHolding}
          onImportScreenshot={onImportScreenshot}
          onImportCsv={onImportCsv}
        />
      )}

      {!bookIsEmpty && (
        <>
      {/* Hero habit loop — sticky on phone */}
      <section className="overview-fade space-y-3 max-sm:static max-sm:z-0 sm:space-y-3">
        <div className="relative overflow-hidden rounded-3xl border border-brand-deep/30 bg-[#161618]/95 p-4 shadow-lg shadow-black/40 backdrop-blur-md sm:bg-[#161618]/80 sm:p-7 sm:shadow-none sm:backdrop-blur-none">
          <div
            className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/12 blur-3xl"
            aria-hidden
          />

          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-xl bg-brand/15 p-2 text-brand-bright">
                  <Radar className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
                    Today’s briefing
                  </h2>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    What matters today · Tallinn
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!guest && visitStreak && visitStreak.currentStreak > 0 && (
                <span
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium tabular-nums text-amber-200"
                  title={streakFlavor(visitStreak.currentStreak)}
                >
                  {visitStreak.currentStreak}d streak
                </span>
              )}
              <span
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums",
                  kind === "open"
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                    : kind === "pre" || kind === "ah"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                      : "border-zinc-700 bg-zinc-900/80 text-zinc-400"
                )}
                title={sessionLabel(marketState)}
              >
                {sessionShort(marketState)}
                <span className={cn("ml-1.5", tone(totals.todayDollar))}>
                  {signedCurrency(totals.todayDollar)}
                </span>
              </span>
            </div>
          </div>

          {!guest && visitStreak && visitStreak.totalVisits > 0 && (
            <div className="relative mt-3 flex items-center gap-2">
              <div className="flex gap-1" title="Last 7 Tallinn days">
                {last7DaysStrip(visitStreak).map((visited, i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 w-4 rounded-full sm:w-5",
                      visited ? "bg-amber-400" : "bg-zinc-800"
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-zinc-400">
                {streakFlavor(visitStreak.currentStreak)}
              </p>
            </div>
          )}

          {/* Scoreboard strip */}
          <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              {
                label: "Book",
                value: currency(totals.totalValue, 0),
                sub: plural(totals.sheetCount, "sheet"),
                explain:
                  "Everything in this sheet is worth right now: your holdings plus cash, at today's prices.",
              },
              {
                label: "Today",
                value: signedCurrency(totals.todayDollar),
                sub: totals.todayPct != null ? percent(totals.todayPct) : "—",
                tone: totals.todayDollar,
                explain:
                  "How much this sheet moved just today. Resets to $0 every morning, it's not your total gain.",
              },
              {
                label: "P&L",
                value: signedCurrency(totals.roiDollar),
                sub: percent(totals.roiPct),
                tone: totals.roiDollar,
                explain:
                  "Profit or loss since you started: the gain or loss on everything you've ever put in, not just today.",
              },
              {
                label: "Cash",
                value: currency(totals.cash, 0),
                sub: totals.cash < 0 ? "Margin" : "Powder",
                explain:
                  totals.cash < 0
                    ? "Negative cash means you're on margin, borrowing from your broker against your holdings."
                    : "Uninvested money sitting ready in this sheet, waiting for you to deploy it.",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5"
              >
                <p className="flex items-center gap-0.5 text-xs uppercase tracking-wide text-zinc-400">
                  {s.label}
                  <InfoTip text={s.explain} />
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-base font-semibold tabular-nums sm:text-lg",
                    "tone" in s && typeof s.tone === "number"
                      ? tone(s.tone)
                      : "text-white"
                  )}
                >
                  {s.value}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    "tone" in s && typeof s.tone === "number"
                      ? tone(s.tone)
                      : "text-zinc-400"
                  )}
                >
                  {s.sub}
                </p>
              </div>
            ))}
          </div>

          <ul className="relative mt-4 space-y-2">
            {briefing.map((b) => (
              <li key={b.id}>
                <BriefingCard
                  kind={b.kind}
                  ticker={b.ticker}
                  title={b.title}
                  detail={b.detail}
                  link={b.link}
                  cta={b.cta}
                  navigable={canFollowBriefingLink(b.link)}
                  onNavigate={handleBriefingNavigate}
                />
              </li>
            ))}
          </ul>

          {visitDiff && visitDiff.lines.length > 0 && (
            <div className="relative mt-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/40 px-3.5 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                While you were away
              </p>
              <p className="mt-0.5 text-xs text-zinc-400">
                Since{" "}
                {new Date(visitDiff.previousAt).toLocaleString("en-GB", {
                  timeZone: "Europe/Tallinn",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <ul className="mt-2 space-y-1.5">
                {visitDiff.lines.slice(0, 4).map((line) => (
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
        </div>
      </section>

      {!guest && <DailyDuelCard tickers={tickers} compact />}

      <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-7">
        <div className="mb-5">
          <h3 className="text-xl font-semibold text-white">Portfolios</h3>
          <p className="mt-1 text-base text-zinc-400">
            {ranked
              ? "Ranked by today, lifetime, then size · bar = book size"
              : "Bar = book size · color = lifetime ROI"}
          </p>
        </div>
        <div className="space-y-6">
          {orderedSheets.map((sheet, i) => (
            <PortfolioLane
              key={sheet.portfolio.id}
              sheet={sheet}
              maxValue={maxSheet}
              onOpen={() => onOpenSheet(sheet.portfolio.id)}
              rival={ranked ? rivalById.get(sheet.portfolio.id) : undefined}
              rank={ranked ? i + 1 : undefined}
            />
          ))}
        </div>
      </section>

      <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-white">Movers</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Biggest swings, both directions
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-zinc-700 bg-zinc-950/50 p-0.5">
            {(["today", "lifetime"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setMoverHorizon(id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium capitalize",
                  moverHorizon === id
                    ? "bg-brand/20 text-brand-bright"
                    : "text-zinc-400 hover:text-zinc-200"
                )}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {movers.length === 0 ? (
            <p className="py-5 text-center text-sm text-zinc-400">
              Waiting on quotes.
            </p>
          ) : (
            movers.map(({ t, mode }, i) => (
              <RankCard
                key={`${mode}-${t.ticker}`}
                rank={i + 1}
                ticker={t}
                mode={mode}
                onOpen={() => openFirstPortfolio(t)}
              />
            ))
          )}
        </div>
      </section>

      <section className="overview-fade rounded-3xl border border-brand-deep/30 bg-[#161618]/70 p-4 sm:p-7">
        <div className="mb-5 flex items-center gap-2.5">
          <div className="rounded-xl bg-violet-500/15 p-2 text-violet-300">
            <CalendarDays className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-white">
              Upcoming earnings
            </h3>
            <p className="mt-1 text-base text-zinc-400">
              Soonest first · next 90 days · Tallinn
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {upcomingEarnings === null ? (
            <div className="space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-zinc-800/80 bg-zinc-900/30 px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="h-4 w-24 rounded bg-zinc-800" />
                    <div className="h-4 w-16 rounded bg-zinc-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : upcomingEarnings.length === 0 ? (
            <p className="text-base text-zinc-400">
              No earnings dates in the next 90 days.
            </p>
          ) : (
            upcomingEarnings.map((e, index) => {
              const owned = tickers.find((t) => t.ticker === e.ticker);
              const soon = e.days <= 7;
              const when = formatRelativeDays(e.days);
              return (
                <div
                  key={e.ticker}
                  className={cn(
                    "rounded-2xl border px-4 py-3.5",
                    soon
                      ? "border-amber-500/30 bg-amber-500/[0.07]"
                      : "border-zinc-800/80 bg-zinc-900/30"
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm tabular-nums text-zinc-400">
                          #{index + 1}
                        </span>
                        <span className="text-lg font-semibold text-white">
                          {cashtag(e.ticker)}
                        </span>
                        {soon && (
                          <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-sm font-medium text-amber-200">
                            Soon
                          </span>
                        )}
                      </div>
                      {owned && <PortfolioChips names={owned.portfolios} />}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-base font-medium tabular-nums text-zinc-100">
                        {when}
                      </p>
                      <p className="mt-0.5 text-sm tabular-nums text-zinc-400">
                        {e.date}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {showCommunities && !guest && <CommunitiesSpotlight />}
        </>
      )}

      {bookIsEmpty && showCommunities && !guest && <CommunitiesSpotlight />}
    </div>
  );
}
