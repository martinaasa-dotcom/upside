"use client";

import { HomeWorld } from "@/components/HomeWorld";
import { CashAlertCard } from "@/components/mobile/CashAlertCard";
import { WatchlistStrip } from "@/components/WatchlistStrip";
import {
  BookNavChart,
  useBookNavHistory,
} from "@/components/mobile/BookNavChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { WidgetErrorBoundary } from "@/components/WidgetErrorBoundary";
import {
  InsightText,
  Panel,
  PanelHeader,
  Pill,
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
import { finiteNumber } from "@/lib/money";
import {
  AlertTriangle,
  ArrowRight,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type LabDeepLink = "seasonality";

/** Signed numbers use gain/loss. Neutral figures stay on the cream. */
const tone = (value: number | null | undefined) =>
  signedTone(value, "text-muted-foreground");

/** Tinted pill for a signed delta, instead of plain colored text. Same
 * Pill every other delta in the app uses — this one sits in the hero
 * Scoreboard, so it's the last place that should look like a smaller,
 * different kind of chip. */
function DeltaBadge({
  value,
  children,
}: {
  value: number | null | undefined;
  children: ReactNode;
}) {
  const up = value != null && value > 0;
  const down = value != null && value < 0;
  return (
    <Pill tone={up ? "good" : down ? "bad" : "neutral"} className="font-mono">
      {children}
    </Pill>
  );
}

/** Enough to see the shape of the day. Eight was a wall of cards. */
const MOVERS_SHOWN = 5;
const EMPTY_ALERTS: UpsideAlert[] = [];

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
  inviteNudge?: boolean;
  onInvitePartner?: () => void;
  onDismissInvite?: () => void;
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
            hint: "Same starting cash as the rest of the class.",
            onClick: onAddHolding,
            primary: true,
          },
        ]
      : [
          {
            key: "csv",
            label: "Upload a CSV",
            hint: "Ticker, shares, buy price. Most brokers export one.",
            onClick: onImportCsv,
            primary: false,
          },
          {
            key: "screenshot",
            label: "Import a screenshot",
            hint: "Your broker holdings page, with shares and cost. Not Apple Stocks or a watchlist.",
            onClick: onImportScreenshot,
            primary: false,
          },
          {
            key: "manual",
            label: "Add one by hand",
            hint: "Ticker, shares, and what you paid.",
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

  const emptyTitle = homework
    ? "Your homework portfolio is empty."
    : "Your portfolio is empty.";
  const emptySubtitle = homework
    ? homeworkCash != null && homeworkCash > 0
      ? `This is paper class. Everyone started with the same cash. Buy names with that paper money. Do not paste a real portfolio in here. You have ${currency(homeworkCash, 0)} sitting ready.`
      : "This is paper class. Everyone started with the same cash. Buy names with that paper money. Do not paste a real portfolio in here."
    : "Paste what you own. One name per line: ticker, shares, cost. This portfolio is only yours until you invite someone.";

  return (
    <Panel tone="brand" className="overview-fade">
      <PanelHeader hero title={emptyTitle} subtitle={emptySubtitle} />

      {!homework && onPasteHoldings && (
        <div className="flex flex-col gap-3">
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={"NBIS 500 85.10\nCRWV 1100 64.45"}
            className="min-h-28 font-mono"
          />
          {pasteErr && <p className="text-sm text-loss">{pasteErr}</p>}
          <Button
            type="button"
            onClick={submitPaste}
            disabled={!paste.trim()}
          >
            Add these names
          </Button>
        </div>
      )}

      {routes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {routes.map((r) => (
            <Item
              key={r.key}
              variant={r.primary ? "default" : "muted"}
              asChild
              className={cn("group h-full items-start", r.primary && "bg-accent")}
            >
              <button type="button" onClick={r.onClick}>
                <ItemContent>
                  <ItemTitle className="text-base font-semibold">
                    {r.label}
                    <ArrowRight
                      className="h-3.5 w-3.5 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                      aria-hidden
                    />
                  </ItemTitle>
                  {"hint" in r && r.hint ? (
                    <ItemDescription className="line-clamp-3">
                      {r.hint}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
              </button>
            </Item>
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

/**
 * One visual language for "a ticker moved the number" — used for the
 * Sunday best/worst pair, the weekday drivers list, and (separately) the
 * Movers panel below. Same colored accent bar, ticker badge, and
 * icon-on-figure treatment everywhere a card exists to say "here's who
 * did it," instead of three different card styles for the same idea.
 */
function DriverTile({
  ticker,
  primary,
  secondary,
  isUp,
  onOpen,
  nested = false,
}: {
  ticker: string;
  primary: string;
  secondary?: string;
  isUp: boolean;
  onOpen?: () => void;
  /** Sits inside a Reading shell (the sentence above it) instead of
   * floating as its own top-level card. Muted well, no second ring. */
  nested?: boolean;
}) {
  const toneCls = isUp ? "text-gain" : "text-loss";
  const body = (
    <>
      <span
        className={cn("absolute inset-y-0 left-0 w-1", isUp ? "bg-gain" : "bg-loss")}
        aria-hidden
      />
      <Badge variant="secondary" className="w-fit font-heading text-sm font-semibold">
        {cashtag(ticker)}
      </Badge>
      <span
        className={cn(
          "flex items-center gap-1.5 font-mono text-2xl font-bold tabular-nums",
          toneCls
        )}
      >
        {isUp ? (
          <TrendingUp className="size-4 shrink-0" />
        ) : (
          <TrendingDown className="size-4 shrink-0" />
        )}
        {primary}
      </span>
      {secondary ? (
        <span className={cn("text-sm", toneCls)}>{secondary}</span>
      ) : null}
    </>
  );
  const shellClass = cn(
    "group relative flex h-full min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-lg p-6 text-left transition",
    nested
      ? "glass-well"
      : cn("card-sheen glass ring-1", isUp ? "ring-gain/20" : "ring-loss/20"),
    onOpen &&
      (nested
        ? "hover:scale-[1.01] hover:bg-accent/70 active:scale-[0.995]"
        : cn(
            "hover:scale-[1.01] hover:bg-accent active:scale-[0.995]",
            isUp ? "hover:ring-gain/40" : "hover:ring-loss/40"
          ))
  );
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={shellClass}>
        {body}
      </button>
    );
  }
  return <div className={shellClass}>{body}</div>;
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
    <div className={cn("flex flex-col gap-6", className)}>
      {sunday ? (
        <Reading label="Sunday">
          {morning.sentence}
          {(sunday.best || sunday.worst) && (
            <div
              className={cn(
                "mt-4 grid grid-cols-1 gap-3",
                sunday.best && sunday.worst && "sm:grid-cols-2"
              )}
            >
              {sunday.best && (
                <DriverTile
                  nested
                  ticker={sunday.best.ticker}
                  primary={signedMovePct(sunday.best.pct)}
                  secondary="Biggest week move"
                  isUp={sunday.best.pct >= 0}
                  onOpen={
                    onOpenPulse ? () => onOpenPulse(sunday.best!.ticker) : undefined
                  }
                />
              )}
              {sunday.worst && (
                <DriverTile
                  nested
                  ticker={sunday.worst.ticker}
                  primary={signedMovePct(sunday.worst.pct)}
                  secondary="Biggest drop"
                  isUp={sunday.worst.pct >= 0}
                  onOpen={
                    onOpenPulse ? () => onOpenPulse(sunday.worst!.ticker) : undefined
                  }
                />
              )}
            </div>
          )}
        </Reading>
      ) : (
        <Reading className="text-base leading-relaxed">
          {morning.sentence}
          {!morning.quiet && morning.drivers.length > 0 && (
            <div
              className={cn(
                "mt-4 grid grid-cols-1 gap-3",
                morning.drivers.length > 1 && "sm:grid-cols-2",
                morning.drivers.length > 2 && "lg:grid-cols-3"
              )}
            >
              {morning.drivers.map((d) => (
                <DriverTile
                  nested
                  key={d.ticker}
                  ticker={d.ticker}
                  primary={signedCurrency(d.dollar, 0)}
                  secondary={
                    d.share != null
                      ? `${Math.round(d.share * 100)}% of today's move`
                      : undefined
                  }
                  isUp={d.dollar >= 0}
                  onOpen={onOpenPulse ? () => onOpenPulse(d.ticker) : undefined}
                />
              ))}
            </div>
          )}
        </Reading>
      )}
      {morning.awayLines.length > 0 && (
        <Reading
          label={
            previousAt
              ? `Since you last looked - ${new Date(previousAt).toLocaleString(
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
          <ul className="flex flex-col gap-2">
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
            "grid gap-4",
            morning.notices.length > 1 && "sm:grid-cols-2"
          )}
        >
          {morning.notices.map((notice) => (
            <Reading
              key={notice.label}
              label={notice.label}
              tone={notice.kind === "gap" ? "warn" : "neutral"}
              icon={
                notice.kind === "gap" ? (
                  <AlertTriangle />
                ) : (
                  <Sparkles />
                )
              }
            >
              <InsightText text={notice.text} />
            </Reading>
          ))}
        </div>
      )}
      {morning.pulseFlags.length > 0 && (
        <Reading label="Worth noticing">
          <div className="flex flex-col gap-2">
            {morning.pulseFlags.map((flag) => (
              <button
                key={flag.ticker}
                type="button"
                onClick={() => onOpenPulse?.(flag.ticker)}
                className="group/flag glass-well flex w-full items-center gap-4 rounded-lg p-4 text-left transition hover:scale-[1.01] hover:bg-accent/70 active:scale-[0.995]"
              >
                <span className="min-w-0 flex-1">
                  <p className="text-sm font-semibold tracking-tight text-foreground">
                    {cashtag(flag.ticker)} · {statusLabel(flag.status)}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {flag.line}
                  </p>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover/flag:translate-x-0.5" />
              </button>
            ))}
          </div>
        </Reading>
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
      className={cn(
        "card-sheen glass group relative flex h-full w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg p-6 text-left ring-1 transition hover:scale-[1.01] hover:bg-accent sm:gap-3",
        isUp ? "ring-gain/20 hover:ring-gain/40" : "ring-loss/20 hover:ring-loss/40"
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          isUp ? "bg-gain" : "bg-loss"
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <Badge variant="secondary" className="h-6 font-heading text-sm font-semibold">
          {cashtag(ticker.ticker)}
        </Badge>
        <span className="mt-1.5 block font-mono text-sm tabular-nums text-muted-foreground">
          {currency(ticker.price)}
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right">
        <span
          className={cn(
            "flex items-center justify-end gap-1 font-mono text-lg font-semibold tabular-nums",
            tone(pct)
          )}
        >
          {isUp ? (
            <TrendingUp className="size-4 shrink-0" />
          ) : (
            <TrendingDown className="size-4 shrink-0" />
          )}
          {pct != null ? percent(pct, lifetime ? 1 : 2) : "—"}
        </span>
        <span className={cn("mt-0.5 block font-mono text-sm tabular-nums", tone(dollars))}>
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
  const initial = sheet.portfolio.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-sheen glass-well group flex w-full flex-col gap-4 rounded-lg p-6 text-left ring-1 ring-foreground/10 transition hover:scale-[1.01] hover:bg-accent hover:ring-primary/25"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-heading text-base font-semibold text-foreground"
            aria-hidden
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-base font-semibold text-foreground">
              {sheet.portfolio.name}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {plural(sheet.holdingCount, "holding")}
              {sheetCashBalance(sheet.portfolio) !== 0
                ? ` · ${currency(sheetCashBalance(sheet.portfolio), 0)} cash`
                : ""}
            </p>
          </div>
        </div>
        <p className="shrink-0 text-right font-mono text-xl font-bold tabular-nums text-foreground">
          {currency(sheet.totalValue, 0)}
        </p>
      </div>

      <Progress
        value={width}
        className={cn(
          // bg-secondary matches this card's own bg-muted exactly, so the
          // track would be invisible against its own container — use the
          // darker bg-card token instead so the fill reads as "X% of a
          // whole," not a floating bar.
          "h-2 bg-card [&_[data-slot=progress-indicator]]:bg-primary",
          hot
            ? "[&_[data-slot=progress-indicator]]:bg-gain"
            : "[&_[data-slot=progress-indicator]]:bg-loss"
        )}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={sheet.roiPct >= 0 ? "good" : "bad"} className="font-mono">
          {percent(sheet.roiPct)} all time
        </Pill>
        {sheet.todayDollar !== 0 ? (
          <Pill
            tone={sheet.todayDollar >= 0 ? "good" : "bad"}
            className="font-mono"
          >
            {signedCurrency(sheet.todayDollar, 0)} today
          </Pill>
        ) : null}
      </div>
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

export const OverviewDashboard = memo(function OverviewDashboard({
  model,
  onOpenSheet,
  activeAlerts = EMPTY_ALERTS,
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
  inviteNudge = false,
  onInvitePartner,
  onDismissInvite,
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
  const maxSheet = Math.max(
    1,
    ...sheets.map((s) => finiteNumber(s.totalValue))
  );
  const [visitDiff, setVisitDiff] = useState<VisitDiff | null>(null);
  const [moverHorizon, setMoverHorizon] = useState<"today" | "lifetime">(
    "today"
  );
  const kind = sessionKind(marketState);

  const tickerKey = tickers.map((t) => t.ticker).join(",");
  const heldTickers = useMemo(
    () => tickers.map((t) => t.ticker),
    [tickers]
  );
  const navPositions = useMemo(
    () => tickers.map((t) => ({ ticker: t.ticker, shares: t.shares })),
    [tickers]
  );

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
    positions: navPositions,
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
      <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-6">
      {inviteNudge && onInvitePartner && (
        <Panel className="overview-fade">
          <PanelHeader
            title="Invite someone who shares this sheet"
            subtitle="One prompt. You can always find Invite next to Add holding."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={onInvitePartner}>
              Invite
            </Button>
            {onDismissInvite && (
              <Button type="button" variant="outline" onClick={onDismissInvite}>
                Not now
              </Button>
            )}
          </div>
        </Panel>
      )}
      <div className="overview-fade flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {morning.moveLabel}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            title={sessionLabel(marketState)}
            className="h-8 gap-1.5 px-2.5"
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                kind === "open"
                  ? "bg-gain"
                  : kind === "pre" || kind === "ah"
                    ? "bg-primary"
                    : "bg-muted-foreground"
              )}
              aria-hidden
            />
            {sessionLabel(marketState)}
          </Badge>
          {onAddHolding && (
            <Button
              type="button"
              onClick={onAddHolding}
            >
              <Plus data-icon="inline-start" />
              Add a holding
            </Button>
          )}
        </div>
      </div>

      <Scoreboard className="overview-fade">
        <Score
          label="Portfolio"
          value={currency(totals.totalValue, 0)}
          sub={plural(totals.sheetCount, "portfolio")}
          valueClassName="text-primary"
        />
        <Score
          label={morning.moveLabel}
          value={signedCurrency(totals.todayDollar, 0)}
          sub={
            totals.todayPct != null ? (
              <DeltaBadge value={totals.todayDollar}>
                {percent(totals.todayPct)}
              </DeltaBadge>
            ) : (
              "—"
            )
          }
          valueClassName={tone(totals.todayDollar)}
        />
        <Score
          label="All time"
          value={signedCurrency(totals.roiDollar, 0)}
          sub={
            <DeltaBadge value={totals.roiDollar}>
              {percent(totals.roiPct)}
            </DeltaBadge>
          }
          valueClassName={tone(totals.roiDollar)}
        />
        <Score
          label="Cash"
          value={currency(totals.cash, 0)}
          sub={totals.cash < 0 ? "Borrowed" : undefined}
          valueClassName={totals.cash < 0 ? "text-loss" : undefined}
          subClassName={totals.cash < 0 ? "text-loss" : undefined}
        />
      </Scoreboard>

      <MorningStack
        className="overview-fade hidden md:flex"
        morning={morning}
        previousAt={visitDiff?.previousAt ?? null}
        onOpenPulse={onOpenPulse}
      />

      <Panel className="hidden md:block">
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
                <span className="font-medium text-muted-foreground">
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
                <span className="font-medium text-muted-foreground">
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
        />
      </Panel>

      <MorningStack
        className="overview-fade md:hidden"
        morning={morning}
        previousAt={visitDiff?.previousAt ?? null}
        onOpenPulse={onOpenPulse}
      />

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
        {movers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Waiting on prices.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
      </Panel>

      {multiSheet && (
        <Panel className="overview-fade">
          <PanelHeader title="Your portfolios" />
          <div className="flex flex-col gap-6">
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

      <WidgetErrorBoundary name="Watchlist">
      <Panel className="overview-fade">
        <WatchlistStrip
          heldTickers={heldTickers}
          onOpenPulse={onOpenPulse}
        />
      </Panel>
      </WidgetErrorBoundary>

      {showCommunities ? (
        <WidgetErrorBoundary name="Around Upside Lab">
          <HomeWorld />
        </WidgetErrorBoundary>
      ) : null}
    </div>
  );
});
