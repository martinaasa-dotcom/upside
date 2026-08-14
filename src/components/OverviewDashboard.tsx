"use client";

import { Sparkline } from "@/components/Sparkline";
import { HomeWorld } from "@/components/HomeWorld";
import {
  Card,
  MicroLabel,
  Panel,
  PanelHeader,
  Pill,
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
import {
  BRIEFING_KIND_LABEL,
  buildInvestorBriefing,
  type BriefingLink,
} from "@/lib/investor-briefing";
import type { UpsideAlert } from "@/lib/alerts";
import { sessionLabel, sessionShort, sessionKind } from "@/lib/market-session";
import type { OverviewModel, SheetScore, TickerScore } from "@/lib/overview";
import type { CoveredCallRow } from "@/lib/types";
import {
  captureVisitSnapshot,
  diffSinceLastVisit,
  loadVisitSnapshot,
  saveVisitSnapshot,
  type VisitDiff,
} from "@/lib/visit-diff";
import { PRODUCT_SENTENCE } from "@/lib/product";
import { ArrowRight, MessageCircle, Radar } from "lucide-react";
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
  onAskMargus?: () => void;
};

function BookNavSpark({ liveNav }: { liveNav: number }) {
  const [points, setPoints] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/book/nav-history")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { points?: { nav: number }[] } | null) => {
        if (cancelled) return;
        const navs = (data?.points ?? []).map((p) => p.nav);
        if (liveNav > 0) navs.push(liveNav);
        setPoints(navs.length >= 2 ? navs : null);
      })
      .catch(() => {
        if (!cancelled) setPoints(null);
      });
    return () => {
      cancelled = true;
    };
  }, [liveNav]);

  if (!points) return null;
  return (
    <Sparkline
      points={points}
      width={72}
      height={22}
      className="mt-1"
    />
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
  onAskMargus,
}: {
  onAddHolding?: () => void;
  onImportScreenshot?: () => void;
  onImportCsv?: () => void;
  onAskMargus?: () => void;
}) {
  const routes = [
    {
      key: "csv",
      label: "Upload a CSV",
      detail: "Most brokers export one. The reliable way in, even if Margus is down.",
      hint: "Reliable",
      onClick: onImportCsv,
      primary: true,
    },
    {
      key: "screenshot",
      label: "Import a screenshot",
      detail:
        "Snap your broker's holdings page. Margus reads it when the model is up.",
      hint: "Fast when it works",
      onClick: onImportScreenshot,
      primary: true,
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
    <Panel tone="brand" className="overview-fade">
      <h2 className="text-lg font-semibold text-white sm:text-2xl">
        Your book is empty. Let&apos;s fix that.
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">
        Add what you own. {PRODUCT_SENTENCE} Then you&apos;ll see what moved,
        and what to look at.
      </p>

      {routes.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {routes.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={r.onClick}
              className={cn(
                "group rounded-xl border p-4 text-left transition active:scale-[0.99]",
                r.primary
                  ? "border-brand/40 bg-brand/10 hover:border-brand/70 hover:bg-brand/15"
                  : "border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 hover:bg-zinc-900/70"
              )}
            >
              <MicroLabel
                className={r.primary ? "text-brand-bright" : undefined}
              >
                {r.hint}
              </MicroLabel>
              <p className="mt-1.5 flex items-center gap-1.5 text-base font-semibold text-white">
                {r.label}
                <ArrowRight
                  className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                  aria-hidden
                />
              </p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                {r.detail}
              </p>
            </button>
          ))}
        </div>
      )}

      {onAskMargus && (
        <button
          type="button"
          onClick={onAskMargus}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:border-brand/50 hover:text-white"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Ask Margus first
        </button>
      )}

      <p className="mt-5 text-sm text-zinc-400">
        Nothing here is advice, and nothing you add is shared until you invite
        someone.
      </p>
    </Panel>
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

  const body = (
    <>
      <MicroLabel>
        {BRIEFING_KIND_LABEL[kind]}
        {ticker ? ` · ${cashtag(ticker)}` : ""}
      </MicroLabel>
      <p className="mt-1 text-sm font-medium text-white sm:text-[15px]">
        {title}
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-zinc-400">{detail}</p>
      {canNavigate && cta && (
        <p className="mt-2 text-xs font-medium text-brand-bright">{cta}</p>
      )}
    </>
  );

  const cardTone = kind === "action" ? "warn" : kind === "play" ? "brand" : "raised";

  if (canNavigate && link) {
    return (
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onNavigate!(link)}
      >
        <Card tone={cardTone} interactive>
          {body}
        </Card>
      </button>
    );
  }

  return <Card tone={cardTone}>{body}</Card>;
}

/** Which of your sheets hold this name. Pointless when you only have one. */
function PortfolioChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-md bg-zinc-800/90 px-2 py-0.5 text-xs text-zinc-300"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function MoverRow({
  ticker,
  mode,
  showSheets,
  onOpen,
}: {
  ticker: TickerScore;
  mode: "win" | "loss" | "today-win" | "today-loss";
  showSheets: boolean;
  onOpen: () => void;
}) {
  const isUp = mode === "win" || mode === "today-win";
  const lifetime = mode === "win" || mode === "loss";
  const metric = lifetime ? ticker.roiPct : (ticker.todayPct ?? 0);
  const dollar = lifetime ? ticker.roiDollar : ticker.todayDollar;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition hover:brightness-110",
        isUp
          ? "border-emerald-500/25 bg-emerald-500/[0.07]"
          : "border-rose-500/25 bg-rose-500/[0.07]"
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-base font-semibold text-white">
            {cashtag(ticker.ticker)}
          </span>
          <span className="text-xs text-zinc-400">
            {ticker.shares.toLocaleString("en-US")} sh ·{" "}
            {currency(ticker.currentValue, 0)}
          </span>
        </div>
        {showSheets && <PortfolioChips names={ticker.portfolios} />}
        <Sparkline points={ticker.sparkline} width={64} height={18} />
      </div>
      <div className="shrink-0 text-right">
        <div
          className={cn("text-lg font-semibold tabular-nums", tone(metric))}
        >
          {percent(metric)}
        </div>
        <div className="mt-0.5 text-xs tabular-nums text-zinc-400">
          {currency(ticker.price)}
        </div>
        <div
          className={cn(
            "text-xs tabular-nums",
            Math.abs(dollar) > 0.005 ? tone(dollar) : "text-zinc-400"
          )}
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
      className="group w-full min-h-11 rounded-xl border border-white/10 bg-hover/60 px-3.5 py-3.5 text-left transition hover:border-brand/35 hover:bg-hover sm:px-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-lg font-semibold text-white group-hover:text-brand-bright">
            {sheet.portfolio.name}
          </p>
          <p className="mt-1 text-sm text-zinc-300">
            {plural(sheet.holdingCount, "holding")} ·{" "}
            {currency(sheet.portfolio.cash_balance, 0)} cash
          </p>
        </div>
        <p className="shrink-0 text-right font-heading text-lg font-semibold tabular-nums text-white">
          {currency(sheet.totalValue, 0)}
        </p>
      </div>

      <div className="mt-3 h-3 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={cn(
            "overview-bar h-full rounded-full",
            hot ? "bg-gain" : "bg-loss"
          )}
          style={{ width: `${width}%` }}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Lifetime
          </p>
          <p className={cn("mt-0.5 font-medium tabular-nums", tone(sheet.roiPct))}>
            {percent(sheet.roiPct)} · {signedCurrency(sheet.roiDollar)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Today
          </p>
          <p
            className={cn(
              "mt-0.5 font-medium tabular-nums",
              tone(sheet.todayDollar)
            )}
          >
            {signedCurrency(sheet.todayDollar)}
            {sheet.todayPct !== null && (
              <span className="ml-1.5">{percent(sheet.todayPct)}</span>
            )}
          </p>
        </div>
      </div>
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
  showCommunities = false,
  hideOptions = true,
  onAddHolding,
  onImportScreenshot,
  onImportCsv,
  onAskMargus,
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

  const tickerKey = tickers.map((t) => t.ticker).join(",");

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
  const kind = sessionKind(marketState);

  function openFirstPortfolio(t: TickerScore) {
    const id = t.portfolioIds[0];
    if (id) onOpenSheet(id);
  }

  function handleBriefingNavigate(link: BriefingLink) {
    if (link.type === "pulse") onOpenPulse?.();
    else if (link.type === "compound") onOpenCompound?.();
    else if (link.type === "sheet") onOpenSheet(link.portfolioId, link.focus);
  }

  function canFollowBriefingLink(link?: BriefingLink): boolean {
    if (!link) return false;
    if (link.type === "pulse") return Boolean(onOpenPulse);
    if (link.type === "compound") return Boolean(onOpenCompound);
    return Boolean(link.portfolioId);
  }

  const bookIsEmpty = model.tickers.length === 0;

  if (bookIsEmpty) {
    return (
      <div className="space-y-6">
        <EmptyBook
          onAddHolding={onAddHolding}
          onImportScreenshot={onImportScreenshot}
          onImportCsv={onImportCsv}
          onAskMargus={onAskMargus}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* One screen: where you stand, then what to make of it. */}
      <Panel className="overview-fade relative overflow-hidden">
        <div
          className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-brand/12 blur-3xl"
          aria-hidden
        />
        <div className="relative">
          <PanelHeader
            hero
            icon={<Radar className="h-4 w-4" />}
            title="Today’s briefing"
            subtitle="How the book is doing, in a few lines."
            actions={
              <>
                {onAskMargus && (
                  <button
                    type="button"
                    onClick={onAskMargus}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:border-brand/50 hover:text-white"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Ask Margus
                  </button>
                )}
                <Pill
                  tone={
                    kind === "open"
                      ? "good"
                      : kind === "pre" || kind === "ah"
                        ? "warn"
                        : "neutral"
                  }
                  title={sessionLabel(marketState)}
                >
                  {sessionShort(marketState)}
                </Pill>
              </>
            }
          />

          {/* The only place today's dollar move is stated. */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <Stat
                label="Book"
                value={currency(totals.totalValue, 0)}
                sub={plural(totals.sheetCount, "sheet")}
                explain="Everything you hold plus your cash, at today's prices."
              />
              <BookNavSpark liveNav={totals.totalValue} />
            </div>
            <Stat
              label="Today"
              value={signedCurrency(totals.todayDollar)}
              sub={totals.todayPct != null ? percent(totals.todayPct) : "—"}
              valueClassName={tone(totals.todayDollar)}
              subClassName={tone(totals.todayDollar)}
              explain="How much you moved just today. This resets every morning, it isn't your total gain."
            />
            <Stat
              label="All time"
              value={signedCurrency(totals.roiDollar)}
              sub={percent(totals.roiPct)}
              valueClassName={tone(totals.roiDollar)}
              subClassName={tone(totals.roiDollar)}
              explain="Profit or loss since you started, on everything you've ever put in."
            />
            <Stat
              label="Cash"
              value={currency(totals.cash, 0)}
              sub={totals.cash < 0 ? "Borrowed" : "Ready to use"}
              valueClassName={totals.cash < 0 ? "text-loss" : undefined}
              subClassName={totals.cash < 0 ? "text-loss" : undefined}
              explain={
                totals.cash < 0
                  ? "Negative cash means you've borrowed from your broker against what you hold. That magnifies both gains and losses."
                  : "Money sitting uninvested, ready whenever you want it."
              }
            />
          </div>

          <ul className="mt-4 space-y-2">
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
            <Card className="mt-4">
              <MicroLabel>While you were away</MicroLabel>
              <p className="mt-0.5 text-xs text-zinc-400">
                Since{" "}
                {new Date(visitDiff.previousAt).toLocaleString("en-GB", {
                  timeZone: "Europe/Tallinn",
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <ul className="mt-2 space-y-1.5">
                {visitDiff.lines.slice(0, 3).map((line) => (
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
            </Card>
          )}
        </div>
      </Panel>

      <Panel className="overview-fade">
        <PanelHeader
          title="Movers"
          subtitle="What moved the most."
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
        <div className="mt-4 space-y-2">
          {movers.length === 0 ? (
            <p className="py-5 text-center text-sm text-zinc-400">
              Waiting on prices.
            </p>
          ) : (
            movers.map(({ t, mode }) => (
              <MoverRow
                key={`${mode}-${t.ticker}`}
                ticker={t}
                mode={mode}
                showSheets={multiSheet}
                onOpen={() => openFirstPortfolio(t)}
              />
            ))
          )}
        </div>
      </Panel>

      {multiSheet && (
        <Panel className="overview-fade">
          <PanelHeader
            title="Your sheets"
            subtitle="Bigger bar, bigger book. Color is all-time return."
          />
          <div className="mt-4 space-y-3">
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

      {showCommunities && !guest && <HomeWorld />}
    </div>
  );
}
