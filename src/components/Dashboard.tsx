"use client";

import { CashModal } from "@/components/CashModal";
import { CcAdvisorChat, type AdvisorAction } from "@/components/CcAdvisorChat";
import { CommandPalette, type CommandItem } from "@/components/CommandPalette";
import { CostBasisModal, type CostBasisRow } from "@/components/CostBasisModal";
import { CoveredCallPanel } from "@/components/CoveredCallPanel";
import { ForecastPanel } from "@/components/ForecastPanel";
import { HoldingModal, type HoldingFormValues } from "@/components/HoldingModal";
import { CompoundInterestSheet } from "@/components/CompoundInterestSheet";
import { LabSheet } from "@/components/LabSheet";
import { HeaderOverflowMenu, type HeaderMenuItem } from "@/components/HeaderOverflowMenu";
import { MacroStrip } from "@/components/MacroStrip";
import { OverviewDashboard, type LabDeepLink } from "@/components/OverviewDashboard";
import {
  PortfolioTable,
  type HoldingPatch,
} from "@/components/PortfolioTable";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { PulsePage } from "@/components/PulsePage";
import { RenameSheetModal } from "@/components/RenameSheetModal";
import { StaleQuotesBanner } from "@/components/StaleQuotesBanner";
import { TickerDrawer } from "@/components/TickerDrawer";
import { UpsideLogo } from "@/components/UpsideLogo";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SnapshotsModal } from "@/components/SnapshotsModal";
import { useToast } from "@/components/ui/Toast";
import {
  buildEarningsAlerts,
  buildStrikeAlerts,
} from "@/lib/alerts";
import {
  captureSheetSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
  type BookUndoSnapshot,
} from "@/lib/book-undo";
import { buildSnapshot } from "@/lib/calculations";
import { clearChatHistory } from "@/lib/chat-history";
import {
  deriveBadges,
  emptyLabBundle,
  type LabBundle,
} from "@/lib/lab-bundle";
import {
  createShareLink,
  fetchLabBundle,
  mirrorLabLocal,
  pushLabBundle,
} from "@/lib/lab-sync-client";
import { loadCashflows } from "@/lib/cashflow";
import { loadArena } from "@/lib/paper-arena";
import { loadWatchlist } from "@/lib/watchlist";
import {
  dismissAlert,
  loadDismissedAlertIds,
  saveDismissedAlertIds,
} from "@/lib/alert-dismiss";
import { currency, percent } from "@/lib/format";
import {
  loadConvictionMap,
  setConviction,
} from "@/lib/conviction";
import {
  milestoneToast,
  recordVisitToday,
  type VisitStreakState,
} from "@/lib/visit-streak";
import { OwnerUnlockModal } from "@/components/OwnerUnlockModal";
import { SheetLockOnboardingModal } from "@/components/SheetLockOnboardingModal";
import { SheetSecretModal } from "@/components/SheetSecretModal";
import {
  getSessionPin,
  isSheetSessionUnlocked,
  loadActiveSheetId,
  markSheetSessionUnlocked,
  ownerPinHeaders,
  saveActiveSheetId,
  setSessionPin,
} from "@/lib/owner-pin-client";
import { buildForecast, type ForecastYear } from "@/lib/forecast";
import {
  loadEoyOverrides,
  mergeEoyTargetPaths,
  saveEoyOverrides,
  setEoyOverride,
  type PortfolioEoyOverrides,
} from "@/lib/forecast-overrides";
import {
  addPortfolio,
  deleteHolding,
  deletePortfolio,
  hasLockedSave,
  loadDemoStore,
  lockDemoStore,
  patchHolding,
  renamePortfolio,
  resetDemoStore,
  updateCash,
  upsertHolding,
} from "@/lib/demo-store";
import {
  getDisplayCurrency,
  loadDisplayCurrencyMap,
  saveDisplayCurrencyMap,
  usdToDisplay,
  type DisplayCurrency,
} from "@/lib/display-currency";
import { normalizeYahooTicker } from "@/lib/ticker";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  buildOverview,
} from "@/lib/overview";
import type {
  Holding,
  OptionCandidate,
  Portfolio,
  Quote,
} from "@/lib/types";
import {
  Lock,
  Plus,
  RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CC_DEFAULT_VISIBLE,
  CC_VISIBLE_KEY,
  FORECAST_DEFAULT_VISIBLE,
  FORECAST_VISIBLE_KEY,
  isPanelVisible,
  loadVisibilityMap,
  saveVisibilityMap,
  setPanelVisible,
  toggleVisibilityMap,
} from "@/lib/panel-visibility";

type DataSource = "demo" | "supabase";

function formatPricesAge(updatedAt: number | null, now: number): string {
  if (updatedAt == null) return "Prices · —";
  const sec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (sec < 5) return "Prices · just now";
  if (sec < 60) return `Prices · ${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `Prices · ${min}m ago`;
  return `Prices · ${Math.floor(min / 60)}h ago`;
}

/**
 * Ticks its own clock so the "Prices · Xs ago" status doesn't force a
 * re-render of the entire Dashboard tree once a second.
 */
function PricesAgeStatus({
  quotesUpdatedAt,
  quotesDelayed,
  bookSyncedAt,
  source,
  locked,
}: {
  quotesUpdatedAt: number | null;
  quotesDelayed: boolean;
  bookSyncedAt: number | null;
  source: DataSource;
  locked: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span
      className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-zinc-500"
      title={
        source === "supabase"
          ? "Shared live book"
          : locked
            ? "Local demo (saved)"
            : "Local demo"
      }
    >
      {formatPricesAge(quotesUpdatedAt, now)}
      {quotesDelayed ? " · delayed" : ""}
      {source === "supabase" && bookSyncedAt
        ? ` · book ${formatPricesAge(bookSyncedAt, now).replace("Prices · ", "")}`
        : ""}
    </span>
  );
}

function extendedHoursFromQuote(q: Quote | null | undefined) {
  if (!q) {
    return {
      marketState: null as string | null,
      preMarketPrice: null as number | null,
      preMarketChange: null as number | null,
      preMarketChangePercent: null as number | null,
      postMarketPrice: null as number | null,
      postMarketChange: null as number | null,
      postMarketChangePercent: null as number | null,
    };
  }
  return {
    marketState: q.marketState,
    preMarketPrice: q.preMarketPrice,
    preMarketChange: q.preMarketChange,
    preMarketChangePercent: q.preMarketChangePercent,
    postMarketPrice: q.postMarketPrice,
    postMarketChange: q.postMarketChange,
    postMarketChangePercent: q.postMarketChangePercent,
  };
}

export function Dashboard() {
  const { push: toast } = useToast();
  const [source, setSource] = useState<DataSource>("demo");
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [saveFlash, setSaveFlash] = useState(false);
  const [locked, setLocked] = useState(false);
  const [activeId, setActiveId] = useState<string>(OVERVIEW_TAB_ID);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [options, setOptions] = useState<Record<string, OptionCandidate | null>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<number | null>(null);
  const [quotesDelayed, setQuotesDelayed] = useState(false);
  const [eurUsd, setEurUsd] = useState<number | null>(null);
  const [eurUsdDetail, setEurUsdDetail] = useState<{
    open: number | null;
    previousClose: number | null;
    last: number | null;
    rate: number | null;
  } | null>(null);
  const [gbpUsd, setGbpUsd] = useState<number | null>(null);
  const [displayCurrencyByPortfolio, setDisplayCurrencyByPortfolio] = useState(
    () => loadDisplayCurrencyMap()
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: "holding"; id: string; label: string }
    | { kind: "sheet"; id: string; label: string }
    | null
  >(null);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [sheetSecretOpen, setSheetSecretOpen] = useState(false);
  const [unlockEpoch, setUnlockEpoch] = useState(0);
  const [lockOnboarding, setLockOnboarding] = useState<{ id: string; name: string } | null>(null);
  const [bookSyncedAt, setBookSyncedAt] = useState<number | null>(null);
  const [margusExpandSignal, setMargusExpandSignal] = useState(0);
  const [mobileMargusCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const [undoStack, setUndoStack] = useState<BookUndoSnapshot[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const shareTokenRef = useRef<string | null>(null);
  if (shareTokenRef.current === null && typeof window !== "undefined") {
    shareTokenRef.current =
      new URLSearchParams(window.location.search).get("share")?.trim() || "";
  }
  const [guestMode] = useState(() => {
    if (typeof window === "undefined") return false;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("view") === "guest" || Boolean(sp.get("share")?.trim());
  });
  const [visitStreak, setVisitStreak] = useState<VisitStreakState | null>(null);
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const [labBundle, setLabBundle] = useState<LabBundle>(() => emptyLabBundle());
  const [labReady, setLabReady] = useState(false);
  const [labIntent, setLabIntent] = useState<LabDeepLink | null>(null);
  const labDirtyRef = useRef(false);
  /** Browser Back/Forward: sync sheet from history without pushing again. */
  const historyFromPopRef = useRef(false);
  /** Until first book load settles, only replaceState (no fake history stack). */
  const historyBootstrappingRef = useRef(true);
  const lastHistorySheetRef = useRef<string | null>(null);
  const [costBasisOpen, setCostBasisOpen] = useState(false);
  const [costBasisRows, setCostBasisRows] = useState<CostBasisRow[]>([]);
  const [drawerTicker, setDrawerTicker] = useState<string | null>(null);
  const convictionMap = labBundle.conviction;
  const [earningsEvents, setEarningsEvents] = useState<
    Array<{ ticker: string; date: string; days: number }>
  >([]);
  const [alertToastsSent, setAlertToastsSent] = useState<Set<string>>(
    () => loadDismissedAlertIds()
  );
  // Read inside effects without adding alertToastsSent as a dependency
  // (that would re-trigger the alert effect on every toast it fires).
  const alertToastsSentRef = useRef(alertToastsSent);
  alertToastsSentRef.current = alertToastsSent;
  const bookRef = useRef({ portfolios, holdings });
  bookRef.current = { portfolios, holdings };
  const pendingPatchRef = useRef<HoldingPatch | null>(null);
  const [ccVisibleByPortfolio, setCcVisibleByPortfolio] = useState(() =>
    loadVisibilityMap(CC_VISIBLE_KEY)
  );
  const [forecastVisibleByPortfolio, setForecastVisibleByPortfolio] = useState(
    () => loadVisibilityMap(FORECAST_VISIBLE_KEY)
  );
  const [eoyOverrides, setEoyOverrides] = useState<PortfolioEoyOverrides>({});

  const isOverview = activeId === OVERVIEW_TAB_ID;
  const isCompound = activeId === COMPOUND_TAB_ID;
  const isLab = activeId === LAB_TAB_ID;
  const isPulse = activeId === PULSE_TAB_ID;
  const isMetaTab = isOverview || isCompound || isLab || isPulse;

  useEffect(() => {
    if (guestMode && isLab) setActiveId(OVERVIEW_TAB_ID);
  }, [guestMode, isLab]);
  const activePortfolio =
    isMetaTab
      ? null
      : (portfolios.find((p) => p.id === activeId) ?? null);

  const activeSheetUnlocked =
    !activePortfolio?.has_access_secret ||
    (activePortfolio != null && isSheetSessionUnlocked(activePortfolio.id));
  // unlockEpoch re-renders after session unlock
  void unlockEpoch;

  const needsSheetUnlock =
    source === "supabase" &&
    !guestMode &&
    !isMetaTab &&
    Boolean(activePortfolio?.has_access_secret) &&
    !activeSheetUnlocked;

  const ccVisible = activePortfolio
    ? isPanelVisible(ccVisibleByPortfolio, activePortfolio, true)
    : true;
  const forecastVisible = activePortfolio
    ? isPanelVisible(
        forecastVisibleByPortfolio,
        activePortfolio,
        FORECAST_DEFAULT_VISIBLE
      )
    : true;

  const allTickers = useMemo(() => {
    const set = new Set(holdings.map((h) => h.ticker));
    return [...set];
  }, [holdings]);
  const allTickersKey = allTickers.join(",");

  useEffect(() => {
    if (!activePortfolio) {
      setEoyOverrides({});
      return;
    }
    setEoyOverrides(loadEoyOverrides(activePortfolio.id));
  }, [activePortfolio]);

  function seedNewSheetPanelDefaults(portfolio: {
    id: string;
    slug?: string | null;
  }) {
    setCcVisibleByPortfolio((prev) => {
      const next = setPanelVisible(prev, portfolio, CC_DEFAULT_VISIBLE);
      saveVisibilityMap(CC_VISIBLE_KEY, next);
      return next;
    });
    setForecastVisibleByPortfolio((prev) => {
      const next = setPanelVisible(prev, portfolio, FORECAST_DEFAULT_VISIBLE);
      saveVisibilityMap(FORECAST_VISIBLE_KEY, next);
      return next;
    });
  }

  function toggleCcVisible() {
    if (!activePortfolio) return;
    setCcVisibleByPortfolio((prev) => {
      // Unset legacy sheets default to visible; new sheets are seeded hidden.
      const next = toggleVisibilityMap(prev, activePortfolio, true);
      saveVisibilityMap(CC_VISIBLE_KEY, next);
      return next;
    });
  }

  function toggleForecastVisible() {
    if (!activePortfolio) return;
    setForecastVisibleByPortfolio((prev) => {
      const next = toggleVisibilityMap(
        prev,
        activePortfolio,
        FORECAST_DEFAULT_VISIBLE
      );
      saveVisibilityMap(FORECAST_VISIBLE_KEY, next);
      return next;
    });
  }

  const portfolioHoldings = useMemo(
    () =>
      holdings
        .filter((h) => h.portfolio_id === activePortfolio?.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    [holdings, activePortfolio?.id]
  );

  const snapshot = useMemo(() => {
    if (!activePortfolio) return null;
    return buildSnapshot(activePortfolio, portfolioHoldings, quotes, options);
  }, [activePortfolio, portfolioHoldings, quotes, options]);

  const overview = useMemo(
    () => buildOverview(portfolios, holdings, quotes),
    [portfolios, holdings, quotes]
  );

  const forecast = useMemo(() => {
    if (!activePortfolio) return null;
    return buildForecast(
      portfolioHoldings,
      quotes,
      activePortfolio.cash_balance,
      eoyOverrides
    );
  }, [activePortfolio, portfolioHoldings, quotes, eoyOverrides]);

  function commitEoyPrice(
    ticker: string,
    year: ForecastYear,
    price: number
  ) {
    if (!activePortfolio) return;
    setEoyOverrides((prev) => {
      const next = setEoyOverride(prev, ticker, year, price);
      saveEoyOverrides(activePortfolio.id, next);
      return next;
    });
  }

  function applyMargusEoyPaths(
    paths: { ticker: string; prices: Partial<Record<ForecastYear, number>> }[]
  ) {
    if (!activePortfolio) return;
    setEoyOverrides((prev) => {
      const next = mergeEoyTargetPaths(prev, paths);
      saveEoyOverrides(activePortfolio.id, next);
      return next;
    });
  }

  function clearEoyOverrides() {
    if (!activePortfolio) return;
    setEoyOverrides({});
    saveEoyOverrides(activePortfolio.id, {});
  }

  const marketState = useMemo(() => {
    for (const q of Object.values(quotes)) {
      if (q.marketState) return q.marketState;
    }
    return null;
  }, [quotes]);

  const pickInitialSheet = useCallback(
    (list: Portfolio[], prev: string) => {
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const sheetParam = params.get("sheet")?.trim().toLowerCase();
        if (sheetParam) {
          if (sheetParam === "compound" || sheetParam === COMPOUND_TAB_ID) {
            return COMPOUND_TAB_ID;
          }
          if (sheetParam === "lab" || sheetParam === LAB_TAB_ID) {
            return LAB_TAB_ID;
          }
          if (sheetParam === "pulse" || sheetParam === PULSE_TAB_ID) {
            return PULSE_TAB_ID;
          }
          if (sheetParam === "overview" || sheetParam === OVERVIEW_TAB_ID) {
            return OVERVIEW_TAB_ID;
          }
          const bySlugOrId = list.find(
            (p) =>
              p.id === sheetParam ||
              p.slug?.toLowerCase() === sheetParam ||
              p.name.toLowerCase() === sheetParam
          );
          if (bySlugOrId) return bySlugOrId.id;
        }
      }
      if (
        prev &&
        (prev === OVERVIEW_TAB_ID ||
          prev === COMPOUND_TAB_ID ||
          prev === LAB_TAB_ID ||
          prev === PULSE_TAB_ID ||
          list.some((p) => p.id === prev))
      ) {
        return prev;
      }
      const saved = loadActiveSheetId();
      if (
        saved &&
        (saved === OVERVIEW_TAB_ID ||
          saved === COMPOUND_TAB_ID ||
          saved === LAB_TAB_ID ||
          saved === PULSE_TAB_ID ||
          list.some((p) => p.id === saved))
      ) {
        return saved;
      }
      return OVERVIEW_TAB_ID;
    },
    []
  );

  const loadPortfolios = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const shareToken = shareTokenRef.current;
      if (shareToken) {
        const res = await fetch(
          `/api/share/${encodeURIComponent(shareToken)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ??
              `Share link failed (${res.status})`
          );
        }
        const data = await res.json();
        setSource("supabase");
        setPortfolios(data.portfolios ?? []);
        setHoldings(data.holdings ?? []);
        setBookSyncedAt(Date.now());
        setShareLabel(
          typeof data.label === "string" ? data.label : "Guest link"
        );
        if (data.lab) {
          const bundle = {
            ...emptyLabBundle(),
            ...data.lab,
          } as LabBundle;
          setLabBundle(bundle);
          mirrorLabLocal(bundle);
          setLabReady(true);
        }
        setActiveId((prev) => pickInitialSheet(data.portfolios ?? [], prev));
        return;
      }

      const res = await fetch("/api/portfolios", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Portfolios request failed (${res.status})`);
      }
      const data = await res.json();
      if (data.source === "supabase" && data.portfolios?.length) {
        setSource("supabase");
        setPortfolios(data.portfolios);
        setHoldings(data.holdings ?? []);
        setBookSyncedAt(Date.now());
        setActiveId((prev) => pickInitialSheet(data.portfolios, prev));
      } else {
        const demo = loadDemoStore();
        setSource("demo");
        setPortfolios(demo.portfolios);
        setHoldings(demo.holdings);
        setActiveId((prev) => pickInitialSheet(demo.portfolios, prev));
        setLocked(hasLockedSave());
      }
    } catch (err) {
      console.error(err);
      if (!opts?.silent) {
        setLoadError(
          err instanceof Error
            ? err.message
            : "Couldn’t load the shared book. Showing local demo — retry when ready."
        );
        const demo = loadDemoStore();
        setSource("demo");
        setPortfolios(demo.portfolios);
        setHoldings(demo.holdings);
        setActiveId((prev) => pickInitialSheet(demo.portfolios, prev));
        setLocked(hasLockedSave());
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [pickInitialSheet]);

  const applyFxPayload = useCallback((fx: {
    eurUsd?: number | null;
    eurUsdOpen?: number | null;
    eurUsdPreviousClose?: number | null;
    eurUsdLast?: number | null;
    gbpUsd?: number | null;
  } | null | undefined) => {
    if (!fx) return;
    const last = typeof fx.eurUsdLast === "number" ? fx.eurUsdLast : null;
    const open = typeof fx.eurUsdOpen === "number" ? fx.eurUsdOpen : null;
    const previousClose =
      typeof fx.eurUsdPreviousClose === "number"
        ? fx.eurUsdPreviousClose
        : null;
    const rate =
      typeof fx.eurUsd === "number" && fx.eurUsd > 0
        ? fx.eurUsd
        : last ?? previousClose ?? open;
    if (rate && rate > 0) setEurUsd(rate);
    setEurUsdDetail({
      rate: rate && rate > 0 ? rate : null,
      open,
      previousClose,
      last,
    });
    if (typeof fx.gbpUsd === "number" && fx.gbpUsd > 0) setGbpUsd(fx.gbpUsd);
  }, []);

  const refreshFx = useCallback(async () => {
    try {
      const res = await fetch("/api/quotes?tickers=EURUSD%3DX", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      applyFxPayload(json.fx);
    } catch {
      /* ignore */
    }
  }, [applyFxPayload]);

  const refreshMarkets = useCallback(
    async (
      tickers: string[],
      rows: Holding[],
      existingQuotes?: Record<string, Quote>,
      opts?: { quotesOnly?: boolean; silent?: boolean }
    ) => {
      if (tickers.length === 0) {
        setQuotes({});
        setOptions({});
        await refreshFx();
        return;
      }
      if (!opts?.silent) setRefreshing(true);
      try {
        let nextQuotes = existingQuotes;
        if (!nextQuotes || Object.keys(nextQuotes).length === 0) {
          const quotesRes = await fetch(
            `/api/quotes?tickers=${encodeURIComponent(tickers.join(","))}`,
            { cache: "no-store" }
          );
          if (!quotesRes.ok) {
            setQuotesDelayed(true);
            throw new Error(`Quotes request failed (${quotesRes.status})`);
          }
          const quotesJson = await quotesRes.json();
          nextQuotes = (quotesJson.quotes ?? {}) as Record<string, Quote>;
          setQuotes(nextQuotes);
          setQuotesUpdatedAt(Date.now());
          setQuotesDelayed(Boolean(quotesJson.delayed));
          applyFxPayload(quotesJson.fx);
        }

        if (opts?.quotesOnly) return;

        const positions = rows.map((h) => {
          const q = nextQuotes![h.ticker];
          const spot = q?.price ?? h.buy_price;
          const history = q?.sparkline?.length
            ? q.sparkline
            : undefined;
          return {
            ticker: h.ticker,
            shares: h.shares,
            spot,
            target_call_pct: h.target_call_pct,
            stock_target: h.stock_target_override,
            price_history: history,
          };
        });

        const optRes = await fetch("/api/options/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positions }),
        });
        const optJson = await optRes.json();
        setOptions(optJson.options ?? {});
      } catch (err) {
        console.error(err);
        setQuotesDelayed(true);
      } finally {
        if (!opts?.silent) setRefreshing(false);
      }
    },
    [applyFxPayload, refreshFx]
  );

  useEffect(() => {
    void refreshFx();
    const id = window.setInterval(() => void refreshFx(), 120_000);
    return () => window.clearInterval(id);
  }, [refreshFx]);

  useEffect(() => {
    void loadPortfolios();
  }, [loadPortfolios]);

  // Personal daily-visit streak — device-local, counts once per Tallinn day
  // regardless of which tab loads first. Skipped for guest/share-link views.
  useEffect(() => {
    if (guestMode) return;
    const { state, justHitMilestone } = recordVisitToday();
    setVisitStreak(state);
    if (justHitMilestone) toast(milestoneToast(justHitMilestone), "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per app load
  }, []);

  // After initial load, sheet switches push history so Back stays in-app.
  useEffect(() => {
    if (loading) {
      historyBootstrappingRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      historyBootstrappingRef.current = false;
    }, 0);
    return () => window.clearTimeout(t);
  }, [loading]);

  useEffect(() => {
    saveActiveSheetId(activeId);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (activeId === OVERVIEW_TAB_ID) {
      url.searchParams.delete("sheet");
    } else if (activeId === COMPOUND_TAB_ID) {
      url.searchParams.set("sheet", "compound");
    } else if (activeId === LAB_TAB_ID) {
      url.searchParams.set("sheet", "lab");
    } else if (activeId === PULSE_TAB_ID) {
      url.searchParams.set("sheet", "pulse");
    } else {
      const p = portfolios.find((x) => x.id === activeId);
      if (p?.slug) url.searchParams.set("sheet", p.slug);
      else url.searchParams.set("sheet", activeId);
    }
    if (guestMode) {
      if (shareTokenRef.current) {
        url.searchParams.set("share", shareTokenRef.current);
        url.searchParams.delete("view");
      } else {
        url.searchParams.set("view", "guest");
      }
    }
    const href = `${url.pathname}${url.search}`;
    const state = { upsideSheet: activeId };

    if (historyFromPopRef.current) {
      historyFromPopRef.current = false;
      lastHistorySheetRef.current = activeId;
      window.history.replaceState(state, "", href);
      return;
    }

    const prev = lastHistorySheetRef.current;
    lastHistorySheetRef.current = activeId;

    if (
      historyBootstrappingRef.current ||
      prev === null ||
      prev === activeId
    ) {
      window.history.replaceState(state, "", href);
      return;
    }

    window.history.pushState(state, "", href);
  }, [activeId, portfolios, guestMode]);

  useEffect(() => {
    function onPopState(e: PopStateEvent) {
      historyFromPopRef.current = true;
      const fromState =
        e.state &&
        typeof e.state === "object" &&
        "upsideSheet" in e.state &&
        typeof (e.state as { upsideSheet?: unknown }).upsideSheet === "string"
          ? (e.state as { upsideSheet: string }).upsideSheet
          : null;

      if (fromState) {
        if (
          fromState === OVERVIEW_TAB_ID ||
          fromState === COMPOUND_TAB_ID ||
          fromState === LAB_TAB_ID ||
          fromState === PULSE_TAB_ID ||
          portfolios.some((p) => p.id === fromState)
        ) {
          setActiveId(fromState);
          return;
        }
      }

      setActiveId((prev) => pickInitialSheet(portfolios, prev));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [portfolios, pickInitialSheet]);

  useEffect(() => {
    if (source !== "supabase") return;
    if (shareTokenRef.current) return;
    const fingerprint = (ps: Portfolio[], hs: Holding[]) =>
      JSON.stringify([
        ps.map((p) => [p.id, p.cash_balance, p.name]),
        hs.map((h) => [
          h.id,
          h.ticker,
          h.shares,
          h.buy_price,
          h.target_call_pct,
          h.stock_target_override,
        ]),
      ]);

    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/portfolios", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.source !== "supabase") return;
        const nextP = (data.portfolios ?? []) as Portfolio[];
        const nextH = (data.holdings ?? []) as Holding[];
        const nextSig = fingerprint(nextP, nextH);
        const local = bookRef.current;
        const localSig = fingerprint(local.portfolios, local.holdings);
        if (nextSig === localSig) {
          setBookSyncedAt(Date.now());
          return;
        }
        setPortfolios(nextP);
        setHoldings(nextH);
        setBookSyncedAt(Date.now());
        toast("Book updated elsewhere — synced", "info");
      } catch {
        /* ignore */
      }
    };

    const id = window.setInterval(() => void tick(), 45_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const ccSignature = portfolioHoldings
    .map(
      (h) =>
        `${h.id}:${h.ticker}:${h.shares}:${h.target_call_pct}:${h.stock_target_override ?? ""}`
    )
    .join("|");

  // Quotes for every ticker; options when on a sheet OR Lab (CC calendar needs premiums)
  useEffect(() => {
    if (holdings.length === 0) return;
    if (isLab) {
      // Full options scan so Lab CC calendar / income isn't stuck at $0
      void refreshMarkets(allTickers, holdings);
      return;
    }
    if (isMetaTab) {
      void refreshMarkets(allTickers, holdings, undefined, {
        quotesOnly: true,
      });
      return;
    }
    if (!activePortfolio) return;
    const rows = holdings.filter((h) => h.portfolio_id === activePortfolio.id);
    void refreshMarkets(allTickers, rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePortfolio?.id,
    isMetaTab,
    isLab,
    ccSignature,
    allTickersKey,
    refreshMarkets,
  ]);

  // Free Yahoo poll: prices every 45s while the tab is visible (options stay on demand)
  useEffect(() => {
    if (allTickers.length === 0) return;

    const POLL_MS = 45_000;
    let cancelled = false;

    const tick = () => {
      if (cancelled || document.hidden) return;
      const rows = isMetaTab
        ? holdings
        : holdings.filter((h) => h.portfolio_id === activePortfolio?.id);
      void refreshMarkets(allTickers, rows, undefined, {
        quotesOnly: true,
        silent: true,
      });
    };

    const id = window.setInterval(tick, POLL_MS);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // ticker identity via allTickersKey fingerprint
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allTickers covered by key
  }, [
    activePortfolio?.id,
    isMetaTab,
    allTickersKey,
    holdings,
    refreshMarkets,
  ]);

  async function ensureSheetWriteAccess(
    portfolioId?: string | null
  ): Promise<boolean> {
    if (source !== "supabase") return true;
    if (guestMode) return false;
    const id = portfolioId ?? activePortfolio?.id ?? null;
    if (!id) return true;
    const sheet =
      portfolios.find((p) => p.id === id) ??
      (activePortfolio?.id === id ? activePortfolio : null);
    if (!sheet?.has_access_secret) return true;
    if (isSheetSessionUnlocked(id)) return true;

    const pin = getSessionPin();
    if (pin) {
      const res = await fetch("/api/owner/verify", {
        method: "POST",
        headers: ownerPinHeaders(pin, { "Content-Type": "application/json" }, id),
        body: JSON.stringify({ portfolioId: id }),
      });
      if (res.ok) {
        markSheetSessionUnlocked(id, pin);
        setUnlockEpoch((n) => n + 1);
        return true;
      }
    }
    setUnlockOpen(true);
    return false;
  }

  async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    const pin = getSessionPin();
    const headers = ownerPinHeaders(
      pin || undefined,
      {
        ...(init?.headers as Record<string, string> | undefined),
      },
      activePortfolio?.id ?? null
    );
    if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401 || res.status === 429) {
      setUnlockOpen(true);
      setUnlockEpoch((n) => n + 1);
    }
    return res;
  }

  async function handleSave(values: HoldingFormValues) {
    if (!activePortfolio) return;

    if (source === "supabase") {
      if (!(await ensureSheetWriteAccess())) return;
      const res = await apiFetch("/api/holdings", {
        method: "POST",
        body: JSON.stringify({
          ...values,
          ticker: normalizeYahooTicker(values.ticker),
          portfolio_id: activePortfolio.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(
          typeof data.error === "string" ? data.error : "Failed to save holding",
          "error"
        );
        return;
      }
      await loadPortfolios({ silent: true });
    } else {
      const store = loadDemoStore();
      const next = upsertHolding(store, {
        ...values,
        eoy_target: null,
        stock_target_override: null,
        portfolio_id: activePortfolio.id,
        sort_order:
          holdings.filter((h) => h.portfolio_id === activePortfolio.id).length +
          1,
      });
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
    }
    setModalOpen(false);
    toast("Holding saved", "success");
  }

  async function handlePatch(patch: HoldingPatch): Promise<boolean> {
    const { id, ...fields } = patch;

    // Clear stale option when strike-driving fields change
    if (
      fields.target_call_pct !== undefined ||
      fields.stock_target_override !== undefined
    ) {
      const ticker = holdings.find((h) => h.id === id)?.ticker;
      if (ticker) {
        setOptions((prev) => ({ ...prev, [ticker]: null }));
      }
    }

    if (source === "supabase") {
      if (!(await ensureSheetWriteAccess())) {
        pendingPatchRef.current = patch;
        toast("Enter owner PIN to save edits", "info");
        return false;
      }
      const res = await apiFetch("/api/holdings", {
        method: "PATCH",
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || res.status === 429) {
          pendingPatchRef.current = patch;
          toast("Unlock this sheet to save", "info");
          return false;
        }
        toast(
          typeof data.error === "string" ? data.error : "Failed to update holding",
          "error"
        );
        return false;
      }
      setHoldings((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...fields } : h))
      );
      return true;
    }
    const next = patchHolding(loadDemoStore(), id, fields);
    setHoldings(next.holdings);
    return true;
  }

  const applyAdvisorActions = useCallback(
    (actions: AdvisorAction[]) => {
      if (!actions.length || !activePortfolio) return;

      setUndoStack((stack) =>
        pushUndoSnapshot(
          stack,
          captureSheetSnapshot({
            label: `Margus · ${actions.map((a) => a.action).slice(0, 3).join(", ")}`,
            portfolio: activePortfolio,
            holdings,
            eoyOverrides,
          })
        )
      );

      const findHolding = (ticker: string, list: Holding[]) =>
        list.find(
          (h) =>
            h.portfolio_id === activePortfolio.id &&
            h.ticker.toUpperCase() === ticker.toUpperCase()
        );

      if (source === "demo") {
        let store = loadDemoStore();
        let portfolios = store.portfolios;
        let nextHoldings = store.holdings;

        for (const action of actions) {
          if (action.action === "set_call_pct") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              target_call_pct: action.callPct,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "set_call_pct_bulk") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                target_call_pct: u.callPct,
              });
              nextHoldings = store.holdings;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
          } else if (action.action === "set_uniform_call_pct") {
            for (const h of nextHoldings.filter(
              (x) => x.portfolio_id === activePortfolio.id
            )) {
              store = patchHolding(store, h.id, {
                target_call_pct: action.callPct,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          } else if (action.action === "update_holding") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            const fields: Partial<Holding> = {};
            if (action.shares != null) fields.shares = action.shares;
            if (action.buyPrice != null) fields.buy_price = action.buyPrice;
            if (Object.keys(fields).length === 0) continue;
            store = patchHolding(store, h.id, fields);
            nextHoldings = store.holdings;
            if (fields.shares != null) {
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
          } else if (action.action === "set_cash") {
            store = updateCash(store, activePortfolio.id, action.cash);
            portfolios = store.portfolios;
          } else if (action.action === "add_holding") {
            const existing = findHolding(action.ticker, nextHoldings);
            store = upsertHolding(store, {
              id: existing?.id,
              portfolio_id: activePortfolio.id,
              ticker: action.ticker,
              shares: action.shares,
              buy_price: action.buyPrice,
              eoy_target: existing?.eoy_target ?? null,
              target_call_pct: action.callPct,
              stock_target_override: existing?.stock_target_override ?? null,
              sort_order:
                existing?.sort_order ??
                nextHoldings.filter(
                  (h) => h.portfolio_id === activePortfolio.id
                ).length + 1,
            });
            nextHoldings = store.holdings;
            void refreshMarkets(
              [action.ticker],
              nextHoldings.filter((h) => h.portfolio_id === activePortfolio.id)
            );
          } else if (action.action === "import_sheet") {
            if (action.cash != null) {
              store = updateCash(store, activePortfolio.id, action.cash);
              portfolios = store.portfolios;
            }
            let sortBase = nextHoldings.filter(
              (h) => h.portfolio_id === activePortfolio.id
            ).length;
            const imported = new Set<string>();
            for (const row of action.holdings) {
              const existing = findHolding(row.ticker, nextHoldings);
              if (!existing) sortBase += 1;
              store = upsertHolding(store, {
                id: existing?.id,
                portfolio_id: activePortfolio.id,
                ticker: row.ticker,
                shares: row.shares,
                buy_price: row.buyPrice,
                eoy_target: existing?.eoy_target ?? null,
                target_call_pct: row.callPct,
                stock_target_override: existing?.stock_target_override ?? null,
                sort_order: existing?.sort_order ?? sortBase,
              });
              nextHoldings = store.holdings;
              imported.add(row.ticker.toUpperCase());
            }
            if (action.replace !== false) {
              for (const h of nextHoldings.filter(
                (x) => x.portfolio_id === activePortfolio.id
              )) {
                if (imported.has(h.ticker.toUpperCase())) continue;
                store = deleteHolding(store, h.id);
                setOptions((opts) => {
                  const next = { ...opts };
                  delete next[h.ticker];
                  return next;
                });
              }
              nextHoldings = store.holdings;
            }
            const tickers = action.holdings.map((h) => h.ticker);
            void refreshMarkets(
              tickers,
              nextHoldings.filter((h) => h.portfolio_id === activePortfolio.id)
            );
            setCostBasisRows(
              action.holdings.map((row) => ({
                ticker: row.ticker,
                shares: row.shares,
                suggestedBuy: row.buyPrice,
                buyPrice: row.buyPrice,
              }))
            );
            setCostBasisOpen(true);
          } else if (action.action === "remove_holding") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = deleteHolding(store, h.id);
            nextHoldings = store.holdings;
            setOptions((opts) => {
              const next = { ...opts };
              delete next[h.ticker];
              return next;
            });
          } else if (action.action === "set_stock_target") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              stock_target_override: action.stockTarget,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "set_stock_target_bulk") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                stock_target_override: u.stockTarget,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          } else if (action.action === "clear_stock_target") {
            const h = findHolding(action.ticker, nextHoldings);
            if (!h) continue;
            store = patchHolding(store, h.id, {
              stock_target_override: null,
            });
            nextHoldings = store.holdings;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          } else if (action.action === "apply_write_plan") {
            for (const u of action.updates) {
              const h = findHolding(u.ticker, nextHoldings);
              if (!h) continue;
              store = patchHolding(store, h.id, {
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              });
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            }
            nextHoldings = store.holdings;
          }
        }

        setPortfolios(portfolios);
        setHoldings(nextHoldings);
        return;
      }

      // Supabase path — await mutations + dedicated import endpoint
      void (async () => {
        if (!(await ensureSheetWriteAccess())) {
          toast("Unlock this sheet before Margus can apply changes", "error");
          return;
        }

        let working = [...holdings];
        const findH = (ticker: string) =>
          working.find(
            (h) =>
              h.portfolio_id === activePortfolio.id &&
              h.ticker.toUpperCase() === ticker.toUpperCase()
          );

        let failures = 0;
        const patchHoldingApi = async (
          id: string,
          fields: Record<string, number | null>
        ) => {
          const res = await apiFetch("/api/holdings", {
            method: "PATCH",
            body: JSON.stringify({ id, ...fields }),
          });
          if (!res.ok) {
            failures += 1;
            return false;
          }
          working = working.map((x) =>
            x.id === id ? ({ ...x, ...fields } as Holding) : x
          );
          setHoldings((prev) =>
            prev.map((x) => (x.id === id ? { ...x, ...fields } : x))
          );
          return true;
        };

        for (const action of actions) {
          if (
            action.action === "set_call_pct" ||
            action.action === "update_holding"
          ) {
            const h = findH(action.ticker);
            if (!h) continue;
            const fields: Record<string, number | null> = {};
            if (action.action === "set_call_pct") {
              fields.target_call_pct = action.callPct;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            } else {
              if (action.shares != null) fields.shares = action.shares;
              if (action.buyPrice != null) fields.buy_price = action.buyPrice;
              if (action.shares != null) {
                setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              }
            }
            if (!Object.keys(fields).length) continue;
            await patchHoldingApi(h.id, fields);
          } else if (action.action === "set_call_pct_bulk") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, { target_call_pct: u.callPct });
            }
          } else if (action.action === "set_uniform_call_pct") {
            for (const h of working.filter(
              (x) => x.portfolio_id === activePortfolio.id
            )) {
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, { target_call_pct: action.callPct });
            }
          } else if (action.action === "set_cash") {
            const res = await apiFetch("/api/portfolios", {
              method: "PATCH",
              body: JSON.stringify({
                id: activePortfolio.id,
                cash_balance: action.cash,
              }),
            });
            if (!res.ok) failures += 1;
            else {
              setPortfolios((prev) =>
                prev.map((p) =>
                  p.id === activePortfolio.id
                    ? { ...p, cash_balance: action.cash }
                    : p
                )
              );
            }
          } else if (action.action === "add_holding") {
            const res = await apiFetch("/api/holdings", {
              method: "POST",
              body: JSON.stringify({
                portfolio_id: activePortfolio.id,
                ticker: action.ticker,
                shares: action.shares,
                buy_price: action.buyPrice,
                target_call_pct: action.callPct,
                sort_order:
                  working.filter((h) => h.portfolio_id === activePortfolio.id)
                    .length + 1,
              }),
            });
            if (!res.ok) failures += 1;
            else await loadPortfolios({ silent: true });
          } else if (action.action === "import_sheet") {
            const res = await apiFetch("/api/holdings/import", {
              method: "POST",
              body: JSON.stringify({
                portfolio_id: activePortfolio.id,
                cash: action.cash ?? null,
                replace: action.replace !== false,
                holdings: action.holdings.map((row) => ({
                  ticker: row.ticker,
                  shares: row.shares,
                  buy_price: row.buyPrice,
                  target_call_pct: row.callPct,
                })),
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              failures += 1;
              toast(
                typeof data.error === "string"
                  ? data.error
                  : "Import failed",
                "error"
              );
            } else {
              const upserted = Number(data.upserted ?? 0);
              const removed = Number(data.removed ?? 0);
              const failed = Array.isArray(data.failed) ? data.failed.length : 0;
              const cashBit = data.cashUpdated ? " · cash updated" : "";
              const removeBit = removed ? ` · removed ${removed}` : "";
              toast(
                `Imported ${upserted} ticker${upserted === 1 ? "" : "s"}${cashBit}${removeBit}${
                  failed ? ` · ${failed} failed` : ""
                }`,
                failed ? "error" : "success"
              );
              await loadPortfolios({ silent: true });
              if (upserted > 0) {
                setCostBasisRows(
                  action.holdings.map((row) => ({
                    ticker: row.ticker,
                    shares: row.shares,
                    suggestedBuy: row.buyPrice,
                    buyPrice: row.buyPrice,
                  }))
                );
                setCostBasisOpen(true);
              }
            }
          } else if (action.action === "remove_holding") {
            const h = findH(action.ticker);
            if (!h) continue;
            const res = await apiFetch(`/api/holdings?id=${h.id}`, {
              method: "DELETE",
            });
            if (!res.ok) failures += 1;
            else {
              working = working.filter((x) => x.id !== h.id);
              setHoldings((prev) => prev.filter((x) => x.id !== h.id));
            }
          } else if (action.action === "set_stock_target") {
            const h = findH(action.ticker);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            await patchHoldingApi(h.id, {
              stock_target_override: action.stockTarget,
            });
          } else if (action.action === "set_stock_target_bulk") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, {
                stock_target_override: u.stockTarget,
              });
            }
          } else if (action.action === "clear_stock_target") {
            const h = findH(action.ticker);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            await patchHoldingApi(h.id, { stock_target_override: null });
          } else if (action.action === "apply_write_plan") {
            for (const u of action.updates) {
              const h = findH(u.ticker);
              if (!h) continue;
              setOptions((opts) => ({ ...opts, [h.ticker]: null }));
              await patchHoldingApi(h.id, {
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              });
            }
          }
        }

        if (failures > 0) {
          toast(`${failures} advisor write(s) failed`, "error");
          await loadPortfolios({ silent: true });
        }
      })();
    },
    // refreshMarkets / loadPortfolios are stable enough via closure for advisor tools
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePortfolio, holdings, source, eoyOverrides]
  );

  function undoLastMargusWrite() {
    const { stack, snap } = popUndoSnapshot(undoStack);
    if (!snap) {
      toast("Nothing to undo", "info");
      return;
    }
    setUndoStack(stack);
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === snap.portfolioId ? { ...p, cash_balance: snap.cashBalance } : p
      )
    );
    setHoldings((prev) => [
      ...prev.filter((h) => h.portfolio_id !== snap.portfolioId),
      ...snap.holdings,
    ]);
    setEoyOverrides(snap.eoyOverrides);
    saveEoyOverrides(snap.portfolioId, snap.eoyOverrides);
    if (source === "demo") {
      const store = loadDemoStore();
      let next = updateCash(store, snap.portfolioId, snap.cashBalance);
      for (const h of next.holdings.filter(
        (x) => x.portfolio_id === snap.portfolioId
      )) {
        next = deleteHolding(next, h.id);
      }
      for (const h of snap.holdings) {
        next = upsertHolding(next, { ...h });
      }
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
    }
    toast(`Undid: ${snap.label}`, "success");
  }

  function requestDeleteHolding(id: string) {
    const h = holdings.find((x) => x.id === id);
    setConfirmDelete({
      kind: "holding",
      id,
      label: h?.ticker ?? "holding",
    });
  }

  async function deleteHoldingById(id: string): Promise<boolean> {
    const removed = holdings.find((h) => h.id === id);
    if (source === "supabase") {
      if (!(await ensureSheetWriteAccess())) return false;
      const res = await apiFetch(`/api/holdings?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Failed to delete holding", "error");
        return false;
      }
      setHoldings((prev) => prev.filter((h) => h.id !== id));
    } else {
      const next = deleteHolding(loadDemoStore(), id);
      setHoldings(next.holdings);
    }
    toast("Holding deleted", "success");
    if (removed && source === "supabase") {
      // Soft undo window via toast action isn't available — re-add on demand not wired.
    }
    return true;
  }

  async function handleAddSheet(name: string) {
    if (source === "supabase") {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        toast("Failed to add sheet", "error");
        return;
      }
      const data = await res.json();
      setPortfolios((prev) => [...prev, data.portfolio]);
      seedNewSheetPanelDefaults(data.portfolio);
      setActiveId(data.portfolio.id);
      setLockOnboarding({
        id: data.portfolio.id,
        name: data.portfolio.name ?? name,
      });
    } else {
      const next = addPortfolio(loadDemoStore(), name);
      setPortfolios(next.portfolios);
      const created = next.portfolios[next.portfolios.length - 1];
      seedNewSheetPanelDefaults(created);
      setActiveId(created.id);
    }
    toast("Sheet added", "success");
  }

  async function handleRenameSheet(id: string, name: string) {
    if (source === "supabase") {
      if (!(await ensureSheetWriteAccess(id))) return;
      const res = await apiFetch("/api/portfolios", {
        method: "PATCH",
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) {
        toast("Failed to rename sheet", "error");
        return;
      }
    } else {
      renamePortfolio(loadDemoStore(), id, name);
    }
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
    setRenameTarget(null);
    toast("Sheet renamed", "success");
  }

  async function deleteSheetById(id: string, pin?: string): Promise<boolean> {
    const sheet = portfolios.find((p) => p.id === id);
    const locked = Boolean(sheet?.has_access_secret);
    const ownerPin = (pin?.trim() || getSessionPin()).trim();
    if (locked && !ownerPin) {
      toast("This sheet’s PIN/password is required to delete it", "error");
      return false;
    }

    if (source === "supabase") {
      if (locked && !(await ensureSheetWriteAccess(id))) return false;
      const res = await apiFetch(`/api/portfolios?id=${id}`, {
        method: "DELETE",
        headers: ownerPinHeaders(ownerPin || undefined, undefined, id),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(
          typeof data.error === "string" ? data.error : "Failed to delete sheet",
          "error"
        );
        return false;
      }
      if (ownerPin) {
        setSessionPin(ownerPin);
        markSheetSessionUnlocked(id, ownerPin);
      }
      setUnlockEpoch((n) => n + 1);
      clearChatHistory(id);
      await loadPortfolios({ silent: true });
      setActiveId((prev) => (prev === id ? OVERVIEW_TAB_ID : prev));
    } else {
      const next = deletePortfolio(loadDemoStore(), id);
      clearChatHistory(id);
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
      if (activeId === id) setActiveId(OVERVIEW_TAB_ID);
    }
    toast("Sheet deleted", "success");
    return true;
  }

  async function handleSaveCash(cash: number) {
    if (!activePortfolio) return;

    if (source === "demo") {
      const next = updateCash(loadDemoStore(), activePortfolio.id, cash);
      setPortfolios(next.portfolios);
    } else {
      if (!(await ensureSheetWriteAccess())) return;
      const res = await apiFetch("/api/portfolios", {
        method: "PATCH",
        body: JSON.stringify({ id: activePortfolio.id, cash_balance: cash }),
      });
      if (!res.ok) {
        toast("Failed to update cash", "error");
        return;
      }
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === activePortfolio.id ? { ...p, cash_balance: cash } : p
        )
      );
    }
    setCashModalOpen(false);
    toast("Cash updated", "success");
  }

  function resetDemo() {
    localStorage.removeItem("portfell-demo-v1");
    localStorage.removeItem("portfell-demo-v2");
    localStorage.removeItem("portfell-demo-v3");
    localStorage.removeItem("portfell-demo-v4");
    localStorage.removeItem("portfell-demo-v5");
    localStorage.removeItem("portfell-demo-v6");
    localStorage.removeItem("portfell-demo-v7");
    localStorage.removeItem("portfell-demo-v8");
    // Do NOT remove portfell-locked — Reset restores the last Save
    const demo = resetDemoStore();
    setPortfolios(demo.portfolios);
    setHoldings(demo.holdings);
    setActiveId(OVERVIEW_TAB_ID);
    setLocked(hasLockedSave());
  }

  function saveLock() {
    const lockedStore = lockDemoStore({ portfolios, holdings });
    setPortfolios(lockedStore.portfolios);
    setHoldings(lockedStore.holdings);
    setLocked(true);
    setSaveFlash(true);
    window.setTimeout(() => setSaveFlash(false), 1600);
    void fetch("/api/demo/lock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lockedStore),
    });
  }

  useEffect(() => {
    if (shareTokenRef.current) return;
    let cancelled = false;
    void (async () => {
      const local: LabBundle = {
        conviction: loadConvictionMap(),
        journal: [],
        cashflows: loadCashflows(),
        arena: loadArena(),
        badges: [],
      };
      const remote = await fetchLabBundle();
      if (cancelled) return;
      if (remote.source === "supabase") {
        const merged: LabBundle = {
          ...emptyLabBundle(),
          ...remote.bundle,
          conviction:
            Object.keys(remote.bundle.conviction ?? {}).length > 0
              ? remote.bundle.conviction
              : local.conviction,
          journal: [],
          cashflows:
            (remote.bundle.cashflows?.length ?? 0) > 0
              ? remote.bundle.cashflows
              : local.cashflows,
          arena: remote.bundle.arena ?? local.arena,
          badges: remote.bundle.badges ?? [],
        };
        setLabBundle(merged);
        mirrorLabLocal(merged);
      } else {
        setLabBundle(local);
      }
      setLabReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!labReady || guestMode || !labDirtyRef.current) return;
    const t = window.setTimeout(() => {
      labDirtyRef.current = false;
      void pushLabBundle(labBundle).then((r) => {
        if (!r.ok && r.error) toast(r.error, "error");
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [labBundle, labReady, guestMode, toast, source]);

  function patchLab(patch: Partial<LabBundle>) {
    if (guestMode) return;
    labDirtyRef.current = true;
    setLabBundle((prev) => ({ ...prev, ...patch }));
  }

  async function handleCreateShare() {
    const result = await createShareLink({
      scope: "overview",
      label: "Guest read-only",
      daysValid: 14,
    });
    if (!result.ok || !result.url) {
      toast(result.error ?? "Couldn’t create share link", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast("Guest link copied (14 days)", "success");
    } catch {
      toast(result.url, "info");
    }
  }

  useEffect(() => {
    if (!labReady || guestMode) return;
    const nextBadges = deriveBadges({
      greenStreakMax: 0,
      roiPct: overview.totals.roiPct,
      holdingCount: overview.totals.uniqueTickers,
      existing: labBundle.badges,
    });
    const same =
      nextBadges.length === labBundle.badges.length &&
      nextBadges.every((b, i) => b.id === labBundle.badges[i]?.id);
    if (same) return;
    labDirtyRef.current = true;
    setLabBundle((prev) => ({ ...prev, badges: nextBadges }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed badges from totals
  }, [
    labReady,
    guestMode,
    overview.totals.roiPct,
    overview.totals.uniqueTickers,
  ]);

  const overviewTickerKey = overview.tickers
    .map((t) => t.ticker)
    .slice(0, 40)
    .join(",");
  useEffect(() => {
    if (!overviewTickerKey) return;
    let cancelled = false;
    void fetch(
      `/api/market/events?tickers=${encodeURIComponent(overviewTickerKey)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const events = Array.isArray(data.earnings) ? data.earnings : [];
        setEarningsEvents(events);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [overviewTickerKey]);

  useEffect(() => {
    if (guestMode) return;
    const strike = buildStrikeAlerts(
      (snapshot?.coveredCallRows ?? []).map((r) => ({
        ticker: r.holding.ticker,
        spot: r.spot,
        stockTarget: r.stockTarget,
        nextStrike: r.nextStrike,
      }))
    );
    const earn = buildEarningsAlerts(earningsEvents);
    const next = [...earn, ...strike];
    const prev = alertToastsSentRef.current;
    const fresh = next.filter((a) => !prev.has(a.id));
    if (fresh.length === 0) return;
    // Compute the new Set as a plain value (not a functional updater) so the
    // toast() side effects below never run inside React's state-update path
    // — doing that was tripping "Cannot update a component while rendering
    // a different component" (setAlertToastsSent's updater was calling
    // toast(), which itself calls setState on ToastProvider).
    const updated = new Set(prev);
    for (const a of fresh) updated.add(a.id);
    saveDismissedAlertIds(updated);
    setAlertToastsSent(updated);
    for (const a of fresh) toast(a.title, "info");
  }, [snapshot?.coveredCallRows, earningsEvents, guestMode, toast]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commandItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      {
        id: "overview",
        label: "Overview",
        group: "Go",
        run: () => setActiveId(OVERVIEW_TAB_ID),
      },
      {
        id: "compound",
        label: "Compound",
        group: "Go",
        run: () => setActiveId(COMPOUND_TAB_ID),
      },
      {
        id: "pulse",
        label: "Pulse — thesis check",
        group: "Go",
        hint: "Big movers",
        run: () => setActiveId(PULSE_TAB_ID),
      },
    ];
    if (!guestMode) {
      items.push({
        id: "lab",
        label: "Lab",
        group: "Go",
        hint: "Play layer",
        run: () => setActiveId(LAB_TAB_ID),
      });
      items.push({
        id: "undo",
        label: "Undo last Margus write",
        group: "Edit",
        run: () => undoLastMargusWrite(),
      });
      items.push({
        id: "unlock",
        label: "Unlock locked sheet",
        group: "Edit",
        run: () => setUnlockOpen(true),
      });
      items.push({
        id: "snapshots",
        label: "Snapshots",
        group: "Edit",
        run: () => setSnapshotsOpen(true),
      });
    }
    for (const p of portfolios) {
      items.push({
        id: `sheet-${p.id}`,
        label: p.name,
        group: "Sheets",
        run: () => setActiveId(p.id),
      });
    }
    for (const t of overview.tickers.slice(0, 30)) {
      items.push({
        id: `ticker-${t.ticker}`,
        label: t.ticker,
        group: "Tickers",
        hint: t.portfolios[0],
        run: () => {
          const sheet = portfolios.find((p) => t.portfolios.includes(p.name));
          if (sheet) setActiveId(sheet.id);
          setDrawerTicker(t.ticker);
        },
      });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [portfolios, overview.tickers, undoStack.length, guestMode]);

  const headerMenuItems: HeaderMenuItem[] = useMemo(() => {
    const items: HeaderMenuItem[] = [];
    if (!guestMode && undoStack.length > 0) {
      items.push({
        id: "undo",
        label: "Undo Margus write",
        onSelect: () => undoLastMargusWrite(),
      });
    }
    items.push({
      id: "cmd",
      label: "Command palette",
      hint: "⌘K",
      onSelect: () => setCmdOpen(true),
    });
    if (source === "supabase" && !guestMode) {
      items.push({
        id: "share",
        label: "Copy guest link",
        onSelect: () => void handleCreateShare(),
      });
      items.push({
        id: "snapshots",
        label: "Snapshots",
        onSelect: () => setSnapshotsOpen(true),
      });
      if (!isMetaTab && activePortfolio) {
        items.push({
          id: "sheet-pin",
          label: activePortfolio.has_access_secret
            ? "Change sheet PIN / password"
            : "Set sheet PIN / password",
          onSelect: () => setSheetSecretOpen(true),
        });
      }
    }
    if (!isMetaTab) {
      items.push({
        id: "cc",
        label: ccVisible ? "Hide covered calls" : "Show covered calls",
        onSelect: () => toggleCcVisible(),
      });
      items.push({
        id: "forecast",
        label: forecastVisible ? "Hide forecast" : "Show forecast",
        onSelect: () => toggleForecastVisible(),
      });
    }
    if (source === "demo") {
      items.push({
        id: "save",
        label: saveFlash ? "Saved" : "Save demo lock",
        onSelect: () => saveLock(),
      });
      items.push({
        id: "reset",
        label: locked ? "Restore save" : "Reset demo",
        onSelect: () => resetDemo(),
      });
    }
    return items;
    // Handlers are plain functions in this component; rebuild when visible UI state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu chrome deps only
  }, [
    guestMode,
    undoStack.length,
    source,
    isMetaTab,
    ccVisible,
    forecastVisible,
    saveFlash,
    locked,
    activePortfolio?.id,
    activePortfolio?.has_access_secret,
  ]);

  const syntheticTickers = useMemo(() => {
    // Heuristic: short sparkline or zero change with delayed flag
    if (!quotesDelayed) return [] as string[];
    return Object.keys(quotes).filter((t) => {
      const q = quotes[t];
      return !q?.sparkline || q.sparkline.length < 5;
    });
  }, [quotes, quotesDelayed]);

  if (loading || portfolios.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#121214] px-6">
        <UpsideLogo variant="icon" className="animate-pulse" />
        <div className="w-full max-w-sm space-y-2" aria-hidden="true">
          <div className="h-2.5 animate-pulse rounded-full bg-zinc-800" />
          <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (!isMetaTab && (!activePortfolio || !snapshot)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#121214] px-6">
        <UpsideLogo variant="icon" className="animate-pulse" />
        <div className="w-full max-w-sm space-y-2" aria-hidden="true">
          <div className="h-2.5 animate-pulse rounded-full bg-zinc-800" />
          <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-zinc-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_52%)] text-zinc-100">
      {guestMode && (
        <div className="border-b border-zinc-700 bg-zinc-900 px-4 py-1.5 text-center text-[11px] text-zinc-400">
          {shareLabel
            ? `${shareLabel} · View-only · no unlock needed`
            : "View-only · no unlock needed"}
        </div>
      )}
      <StaleQuotesBanner
        delayed={quotesDelayed}
        updatedAt={quotesUpdatedAt}
        syntheticTickers={syntheticTickers}
      />
      <header className="border-b border-brand-deep/25 bg-[#121214]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveId(OVERVIEW_TAB_ID)}
              className="shrink-0 rounded-md outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/50"
              title="Go to Overview"
              aria-label="Upside — go to Overview"
            >
              <UpsideLogo
                variant="wordmark"
                className="text-[15px] text-white"
              />
            </button>
            <span
              className="hidden h-3.5 w-px shrink-0 bg-zinc-700 sm:block"
              aria-hidden
            />
            <h1
              className="min-w-0 truncate text-[15px] font-medium leading-none tracking-tight text-zinc-300"
              title={
                source === "supabase"
                  ? "Shared live book"
                  : locked
                    ? "Local demo (saved)"
                    : "Local demo"
              }
            >
              {isOverview
                ? "Overview"
                : isCompound
                  ? "Compound"
                  : isPulse
                    ? "Pulse"
                    : isLab
                      ? "Lab"
                      : activePortfolio!.name}
            </h1>
          </div>
          <div className="flex shrink-0 items-center justify-end gap-1.5">
            {source === "supabase" && needsSheetUnlock && !guestMode && (
              <button
                type="button"
                onClick={() => setUnlockOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-brand/60 bg-brand/15 px-2.5 py-1.5 text-xs font-semibold text-brand-bright hover:bg-brand/25"
                title="This sheet is locked — unlock to edit"
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Unlock</span>
              </button>
            )}
            {source === "supabase" &&
              !isMetaTab &&
              activePortfolio?.has_access_secret &&
              activeSheetUnlocked && (
                <span
                  className="hidden items-center gap-1 rounded-md border border-emerald-500/30 px-2 py-1 text-[10px] font-medium text-emerald-300 sm:inline-flex"
                  title="Sheet unlocked in this tab"
                >
                  <Lock className="h-3 w-3" /> Unlocked
                </span>
              )}
            <button
              type="button"
              onClick={() => {
                if (isLab) {
                  void refreshMarkets(allTickers, holdings);
                } else if (isMetaTab) {
                  void refreshMarkets(allTickers, holdings, undefined, {
                    quotesOnly: true,
                  });
                } else {
                  void refreshMarkets(allTickers, portfolioHoldings);
                }
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
              title={isLab ? "Refresh prices & option premiums" : "Refresh prices"}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden md:inline">Refresh</span>
            </button>
            {!isMetaTab && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-[#121214] hover:bg-brand-bright"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add holding</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
            <HeaderOverflowMenu items={headerMenuItems} />
          </div>
        </div>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1 border-t border-zinc-800/60 px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4">
          <PricesAgeStatus
            quotesUpdatedAt={quotesUpdatedAt}
            quotesDelayed={quotesDelayed}
            bookSyncedAt={bookSyncedAt}
            source={source}
            locked={locked}
          />
          <MacroStrip />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-3 py-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:gap-5 sm:px-4 sm:py-5 sm:pb-28 md:pb-24">
        {loadError && (
          <div className="flex flex-col gap-2 rounded-xl border border-rose-500/30 bg-rose-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-rose-100">{loadError}</p>
            <button
              type="button"
              onClick={() => void loadPortfolios()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rose-400/40 px-3 py-1.5 text-xs font-medium text-rose-100 hover:bg-rose-900/50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        )}

        {needsSheetUnlock && !guestMode && (
          <div className="flex flex-col gap-2 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-brand-bright">
              “{activePortfolio?.name}” is locked — unlock with its PIN/password
              to edit.
            </p>
            <button
              type="button"
              onClick={() => setUnlockOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-[#121214] hover:bg-brand-bright"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock to edit
            </button>
          </div>
        )}

        {isLab ? (
          <LabSheet
            overview={overview}
            portfolios={portfolios}
            holdings={holdings}
            quotes={quotes}
            coveredCallRows={
              portfolios.flatMap((p) => {
                const rows = holdings.filter((h) => h.portfolio_id === p.id);
                return buildSnapshot(p, rows, quotes, options).coveredCallRows;
              })
            }
            earnings={earningsEvents}
            lab={labBundle}
            onLabChange={patchLab}
            guest={guestMode}
            dismissedAlertIds={alertToastsSent}
            onDismissAlert={(id) =>
              setAlertToastsSent((prev) => dismissAlert(id, prev))
            }
            intentTab={labIntent}
            onIntentConsumed={() => setLabIntent(null)}
          />
        ) : isCompound ? (
          <CompoundInterestSheet
            bookValue={overview.totals.totalValue}
            sheets={overview.sheets.map((s) => ({
              id: s.portfolio.id,
              name: s.portfolio.name,
              value: s.totalValue,
            }))}
            eurUsd={eurUsd}
            eurUsdDetail={eurUsdDetail}
          />
        ) : isPulse ? (
          <PulsePage
            model={overview}
            quotes={quotes}
            convictions={convictionMap}
          />
        ) : isOverview ? (
          <>
            <OverviewDashboard
              model={overview}
              visitStreak={visitStreak}
              onOpenSheet={(id) => setActiveId(id)}
              coveredCallRows={portfolios.flatMap((p) => {
                const rows = holdings.filter((h) => h.portfolio_id === p.id);
                return buildSnapshot(p, rows, quotes, options).coveredCallRows;
              })}
              cashflows={labBundle.cashflows}
              marketState={marketState}
              guest={guestMode}
              onOpenLab={(tab) => {
                if (tab) setLabIntent(tab);
                setActiveId(LAB_TAB_ID);
              }}
              onOpenPulse={() => setActiveId(PULSE_TAB_ID)}
              onOpenCompound={() => setActiveId(COMPOUND_TAB_ID)}
            />
            <CcAdvisorChat
              key={OVERVIEW_TAB_ID}
              portfolioId={OVERVIEW_TAB_ID}
              context={{
                portfolioName: "Overview",
                cashBalance: overview.totals.cash,
                adviseOnly: true,
                eurUsd,
                gbpUsd,
                watchlist: loadWatchlist(),
                holdings: overview.tickers.map((t) => ({
                  ticker: t.ticker,
                  shares: t.shares,
                  buyPrice: t.shares > 0 ? t.buyValue / t.shares : 0,
                  price: t.price,
                  cost: t.buyValue,
                  value: t.currentValue,
                  roiPct: t.roiPct,
                  roiDollar: t.roiDollar,
                  pctOfTotal:
                    overview.totals.equityValue > 0
                      ? t.currentValue / overview.totals.equityValue
                      : 0,
                  todayPct: t.todayPct,
                  portfolios: t.portfolios,
                  ...extendedHoursFromQuote(quotes[t.ticker]),
                })),
                rows: [],
                marketState,
                totals: {
                  cost: overview.totals.buyValue,
                  value: overview.totals.totalValue,
                  roiPct: overview.totals.roiPct,
                  roiDollar: overview.totals.roiDollar,
                  yield2wAvg: 0,
                  premiumTotal: 0,
                },
                otherPortfolios: portfolios.map((p) => ({
                  name: p.name,
                  cashBalance: p.cash_balance,
                  holdings: holdings
                    .filter((h) => h.portfolio_id === p.id)
                    .map((h) => ({
                      ticker: h.ticker,
                      shares: h.shares,
                      buyPrice: h.buy_price,
                      callPct: h.target_call_pct,
                      stockTarget: h.stock_target_override,
                    })),
                })),
              }}
              onApplyActions={() => {
                /* advise-only — mutations disabled */
              }}
            />
          </>
        ) : (
          <>
            <PortfolioTable
              portfolio={activePortfolio!}
              holdings={snapshot!.holdings}
              totals={snapshot!.totals}
              onPatch={handlePatch}
              onDelete={requestDeleteHolding}
              onEditCash={() => setCashModalOpen(true)}
              onAddHolding={() => setModalOpen(true)}
              onAskMargus={() =>
                setMargusExpandSignal((n) => n + 1)
              }
              onOpenTicker={(t) => setDrawerTicker(t)}
              displayCurrency={getDisplayCurrency(
                displayCurrencyByPortfolio,
                activePortfolio!.id
              )}
              eurUsd={eurUsd}
              onDisplayCurrencyChange={(code: DisplayCurrency) => {
                setDisplayCurrencyByPortfolio((prev) => {
                  const next = { ...prev, [activePortfolio!.id]: code };
                  saveDisplayCurrencyMap(next);
                  return next;
                });
              }}
            />

            {ccVisible && (
              <CoveredCallPanel
                rows={snapshot!.coveredCallRows}
                yield2wAvg={snapshot!.totals.yield2wAvg}
                premiumTotal={snapshot!.totals.premiumTotal}
                onPatchTargetCall={(id, target_call_pct) =>
                  handlePatch({ id, target_call_pct })
                }
                onPatchStockTarget={(id, stockTarget) =>
                  handlePatch({ id, stock_target_override: stockTarget })
                }
                onAddHolding={() => setModalOpen(true)}
              />
            )}

            {forecastVisible && forecast && activePortfolio && (
              <ForecastPanel
                model={forecast}
                portfolioId={activePortfolio.id}
                portfolioName={activePortfolio.name}
                cashBalance={activePortfolio.cash_balance}
                overrides={eoyOverrides}
                onSetEoyPrice={commitEoyPrice}
                onApplyMargusPaths={applyMargusEoyPaths}
                onClearOverrides={clearEoyOverrides}
              />
            )}

            <CcAdvisorChat
              key={activePortfolio!.id}
              portfolioId={activePortfolio!.id}
              defaultCollapsed={mobileMargusCollapsed}
              expandSignal={margusExpandSignal}
              context={{
                portfolioName: activePortfolio!.name,
                cashBalance: activePortfolio!.cash_balance,
                eurUsd,
                gbpUsd,
                watchlist: loadWatchlist(),
                holdings: snapshot!.holdings.map((h) => ({
                  ticker: h.ticker,
                  shares: h.shares,
                  buyPrice: h.buy_price,
                  price: h.quote?.price ?? h.buy_price,
                  cost: h.buyValue,
                  value: h.currentValue,
                  roiPct: h.roiPct,
                  roiDollar: h.roiDollar,
                  pctOfTotal: h.pctOfTotal,
                  todayPct: h.quote?.changePercent ?? null,
                  ...extendedHoursFromQuote(h.quote),
                })),
                rows: snapshot!.coveredCallRows.map((r) => ({
                  ticker: r.holding.ticker,
                  spot: r.spot,
                  callPct: r.targetCall,
                  stockTarget: r.stockTarget,
                  distance: r.targetDistance,
                  nextStrike: r.nextStrike,
                  contracts: r.contracts,
                  yield2w: r.yield2w,
                  premium: r.premium,
                  expiration: r.expiration,
                })),
                marketState,
                totals: {
                  cost: snapshot!.totals.buyValue,
                  value: snapshot!.totals.currentValue,
                  roiPct: snapshot!.totals.roiPct,
                  roiDollar: snapshot!.totals.roiDollar,
                  yield2wAvg: snapshot!.totals.yield2wAvg,
                  premiumTotal: snapshot!.totals.premiumTotal,
                },
                otherPortfolios: portfolios
                  .filter((p) => p.id !== activePortfolio!.id)
                  .map((p) => ({
                    name: p.name,
                    cashBalance: p.cash_balance,
                    holdings: holdings
                      .filter((h) => h.portfolio_id === p.id)
                      .map((h) => ({
                        ticker: h.ticker,
                        shares: h.shares,
                        buyPrice: h.buy_price,
                        callPct: h.target_call_pct,
                        stockTarget: h.stock_target_override,
                      })),
                  })),
              }}
              onApplyActions={applyAdvisorActions}
            />
          </>
        )}
      </main>

      <PortfolioTabs
        portfolios={portfolios}
        activeId={activeId}
        onChange={setActiveId}
        onAdd={handleAddSheet}
        guest={guestMode}
        onRenameRequest={(id, name) => setRenameTarget({ id, name })}
        onDeleteRequest={(id, name) =>
          setConfirmDelete({ kind: "sheet", id, label: name })
        }
        mobileSummary={{
          title:
            isOverview || isLab || isCompound
              ? "Book"
              : (activePortfolio?.name ?? "Sheet"),
          totalValue: (() => {
            const usdAmt = isMetaTab
              ? overview.totals.totalValue
              : (snapshot?.totals.currentValue ?? overview.totals.totalValue);
            const code =
              activePortfolio != null
                ? getDisplayCurrency(
                    displayCurrencyByPortfolio,
                    activePortfolio.id
                  )
                : "USD";
            return currency(usdToDisplay(usdAmt, code, eurUsd), 2, code);
          })(),
          todayValue: (() => {
            const usdAmt = isMetaTab
              ? overview.totals.todayDollar
              : (overview.sheets.find((s) => s.portfolio.id === activeId)
                  ?.todayDollar ?? 0);
            const code =
              activePortfolio != null
                ? getDisplayCurrency(
                    displayCurrencyByPortfolio,
                    activePortfolio.id
                  )
                : "USD";
            return currency(usdToDisplay(usdAmt, code, eurUsd), 2, code);
          })(),
          todayPct: (() => {
            const pct = isMetaTab
              ? overview.totals.todayPct
              : overview.sheets.find((s) => s.portfolio.id === activeId)
                  ?.todayPct;
            return pct != null ? percent(pct) : null;
          })(),
          todayPositive: (isMetaTab
            ? overview.totals.todayDollar
            : (overview.sheets.find((s) => s.portfolio.id === activeId)
                ?.todayDollar ?? 0)) >= 0,
        }}
      />

      <HoldingModal
        open={modalOpen}
        portfolioName={activePortfolio?.name ?? ""}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      <CashModal
        open={cashModalOpen}
        portfolioName={activePortfolio?.name ?? ""}
        initialCash={activePortfolio?.cash_balance ?? 0}
        onClose={() => setCashModalOpen(false)}
        onSave={handleSaveCash}
      />

      <RenameSheetModal
        open={Boolean(renameTarget)}
        initialName={renameTarget?.name ?? ""}
        onClose={() => setRenameTarget(null)}
        onSave={(name) => {
          if (!renameTarget) return;
          void handleRenameSheet(renameTarget.id, name);
        }}
      />

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title={
          confirmDelete?.kind === "sheet"
            ? "Delete portfolio sheet?"
            : "Delete holding?"
        }
        body={
          confirmDelete?.kind === "sheet"
            ? `Delete “${confirmDelete.label}” and all of its holdings? A safety snapshot is saved first.${
                portfolios.find((p) => p.id === confirmDelete.id)
                  ?.has_access_secret
                  ? " This sheet’s PIN/password is required."
                  : ""
              }`
            : `Remove ${confirmDelete?.label ?? "this holding"} from the sheet?`
        }
        confirmLabel="Delete"
        destructive
        requirePin={Boolean(
          confirmDelete?.kind === "sheet" &&
            portfolios.find((p) => p.id === confirmDelete.id)?.has_access_secret
        )}
        pinLabel="Sheet PIN / password"
        initialPin={getSessionPin()}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async (pin) => {
          if (!confirmDelete) return false;
          if (confirmDelete.kind === "sheet") {
            return deleteSheetById(confirmDelete.id, pin);
          }
          return deleteHoldingById(confirmDelete.id);
        }}
      />

      <SnapshotsModal
        open={snapshotsOpen}
        onClose={() => setSnapshotsOpen(false)}
        activePortfolioId={
          !isMetaTab ? activePortfolio?.id ?? null : null
        }
        activePortfolioName={
          !isMetaTab ? activePortfolio?.name ?? null : null
        }
        onRestored={(mode) => {
          toast(
            mode === "sheet"
              ? "Sheet restored from snapshot"
              : "Book restored from snapshot",
            "success"
          );
          void loadPortfolios({ silent: true });
        }}
      />

      <OwnerUnlockModal
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        portfolioId={activePortfolio?.id ?? null}
        portfolioName={activePortfolio?.name ?? null}
        hasSheetSecret={Boolean(activePortfolio?.has_access_secret)}
        onUnlocked={(pin) => {
          if (activePortfolio?.id) {
            markSheetSessionUnlocked(activePortfolio.id, pin);
          }
          setUnlockEpoch((n) => n + 1);
          toast("Sheet unlocked for this tab", "success");
          const pending = pendingPatchRef.current;
          pendingPatchRef.current = null;
          if (pending) void handlePatch(pending);
        }}
      />

      <SheetLockOnboardingModal
        open={Boolean(lockOnboarding)}
        portfolioId={lockOnboarding?.id ?? ""}
        portfolioName={lockOnboarding?.name ?? ""}
        onSkip={() => setLockOnboarding(null)}
        onLocked={() => {
          if (lockOnboarding) {
            setPortfolios((prev) =>
              prev.map((p) =>
                p.id === lockOnboarding.id
                  ? { ...p, has_access_secret: true }
                  : p
              )
            );
            setUnlockEpoch((n) => n + 1);
            toast("Sheet locked", "success");
          }
          setLockOnboarding(null);
        }}
      />

      {activePortfolio && (
        <SheetSecretModal
          open={sheetSecretOpen}
          portfolioId={activePortfolio.id}
          portfolioName={activePortfolio.name}
          hasSheetSecret={Boolean(activePortfolio.has_access_secret)}
          onClose={() => setSheetSecretOpen(false)}
          onChanged={(has) => {
            setPortfolios((prev) =>
              prev.map((p) =>
                p.id === activePortfolio.id
                  ? { ...p, has_access_secret: has }
                  : p
              )
            );
            if (has) {
              markSheetSessionUnlocked(activePortfolio.id);
            }
            setUnlockEpoch((n) => n + 1);
          }}
        />
      )}

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={commandItems}
      />

      <CostBasisModal
        open={costBasisOpen && !guestMode}
        rows={costBasisRows}
        onChangeRow={(ticker, buyPrice) =>
          setCostBasisRows((prev) =>
            prev.map((r) =>
              r.ticker === ticker ? { ...r, buyPrice } : r
            )
          )
        }
        onClose={() => setCostBasisOpen(false)}
        onApply={async () => {
          if (!activePortfolio) {
            setCostBasisOpen(false);
            return;
          }
          for (const row of costBasisRows) {
            const h = holdings.find(
              (x) =>
                x.portfolio_id === activePortfolio.id &&
                x.ticker.toUpperCase() === row.ticker.toUpperCase()
            );
            if (!h) continue;
            await handlePatch({
              id: h.id,
              buy_price: row.buyPrice,
            });
          }
          setCostBasisOpen(false);
          toast("Cost basis updated", "success");
        }}
      />

      <TickerDrawer
        open={Boolean(drawerTicker)}
        ticker={drawerTicker}
        spot={drawerTicker ? quotes[drawerTicker]?.price ?? null : null}
        shares={
          drawerTicker
            ? holdings
                .filter((h) => h.ticker === drawerTicker)
                .reduce((s, h) => s + h.shares, 0)
            : null
        }
        buyPrice={
          drawerTicker
            ? (() => {
                const rows = holdings.filter((h) => h.ticker === drawerTicker);
                const sh = rows.reduce((s, h) => s + h.shares, 0);
                const cost = rows.reduce(
                  (s, h) => s + h.shares * h.buy_price,
                  0
                );
                return sh > 0 ? cost / sh : null;
              })()
            : null
        }
        sparkline={
          drawerTicker ? quotes[drawerTicker]?.sparkline : undefined
        }
        conviction={
          drawerTicker
            ? convictionMap[drawerTicker.toUpperCase()] ?? null
            : null
        }
        onConviction={(level, thesis) => {
          if (!drawerTicker || guestMode) return;
          patchLab({
            conviction: setConviction(convictionMap, drawerTicker, {
              level,
              thesis,
            }),
          });
        }}
        onClose={() => setDrawerTicker(null)}
        onAskMargus={
          guestMode
            ? undefined
            : () => {
                setMargusExpandSignal((n) => n + 1);
              }
        }
      />
    </div>
  );
}
