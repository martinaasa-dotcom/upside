"use client";

import { track } from "@vercel/analytics";
import { AppHeader } from "@/components/AppHeader";
import { CashModal } from "@/components/CashModal";
import type { AdvisorAction } from "@/components/CcAdvisorChat";
import { CommandPalette, type CommandItem } from "@/components/CommandPalette";
import { CsvImportModal } from "@/components/CsvImportModal";
import { CostBasisModal, type CostBasisRow } from "@/components/CostBasisModal";
import { CoveredCallPanel, COVERED_CALLS_ANCHOR } from "@/components/CoveredCallPanel";
import { ExperienceOnboardingModal } from "@/components/ExperienceOnboardingModal";
import { ForecastPanel, ForecastOffStub } from "@/components/ForecastPanel";
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
import { useAuth } from "@/components/AuthProvider";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SnapshotsModal } from "@/components/SnapshotsModal";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "next/navigation";
import {
  buildDecisionAlerts,
  buildEarningsAlerts,
  buildStrikeAlerts,
  type UpsideAlert,
} from "@/lib/alerts";
import {
  captureSheetSnapshot,
  popUndoSnapshot,
  pushUndoSnapshot,
  type BookUndoSnapshot,
} from "@/lib/book-undo";
import { buildSnapshot, STRATEGY } from "@/lib/calculations";
import type { CsvHoldingRow } from "@/lib/csv-import";
import { clearChatHistory } from "@/lib/chat-history";
import { loadWatchlist } from "@/lib/watchlist";
import {
  loadDismissedAlertIds,
  saveDismissedAlertIds,
} from "@/lib/alert-dismiss";
import { setConviction } from "@/lib/conviction";
import { PULSE_REFRESH_MS, effectiveMove } from "@/lib/thesis-pulse";
import {
  milestoneToast,
  recordVisitToday,
} from "@/lib/visit-streak";
import {
  loadActiveSheetId,
  saveActiveSheetId,
} from "@/lib/active-sheet";
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
  type DisplayCurrency,
} from "@/lib/display-currency";
import { normalizeYahooTicker } from "@/lib/ticker";
import {
  clearBookCache,
  markSeedClaimed,
  readBookCache,
  shouldClaimSeed,
  writeBookCache,
} from "@/lib/book-cache";
import {
  COMPOUND_TAB_ID,
  LAB_TAB_ID,
  OVERVIEW_TAB_ID,
  PULSE_TAB_ID,
  SEASONALITY_TAB_ID,
  buildOverview,
  todayDollarFor,
} from "@/lib/overview";
import type {
  Holding,
  OptionCandidate,
  Portfolio,
  Quote,
} from "@/lib/types";
import {
  Plus,
  RefreshCw,
  SlidersHorizontal,
  UserPlus,
} from "lucide-react";
import { quotePollMs, quotesUrl } from "@/lib/market/session";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

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
import {
  shouldHideOptions,
  loadStoredKnowsOptions,
  loadStoredTier,
  saveStoredKnowsOptions,
  saveStoredTier,
  TIER_HIDDEN_LAB_TABS,
  TIER_HIDDEN_META_TABS,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { InvitePartnerModal } from "@/components/InvitePartnerModal";
import { DashboardLoading } from "@/components/DashboardLoading";
import { useLabSync } from "@/components/use-lab-sync";
import { FIRST_SHEET_NAME } from "@/lib/product";
import {
  loadInviteNudgeDismissed,
  saveInviteNudgeDismissed,
} from "@/lib/invite-nudge";
import { pickLoadingMessage } from "@/lib/loading-messages";
import { loadCachedQuotes, mergeQuotes, saveCachedQuotes } from "@/lib/quote-cache";

/**
 * Margus is a collapsed floating panel almost nobody opens on first paint,
 * but eagerly importing him put the AI SDK, react-markdown, remark-gfm and
 * zod on every dashboard load. Deferred here and warmed on idle below, so
 * the chunk is nearly always in cache before the first click (which
 * matters: the silent screenshot import clicks a file input, and browsers
 * only allow that close to a real user gesture).
 */
const CcAdvisorChat = dynamic(
  () => import("@/components/CcAdvisorChat").then((m) => m.CcAdvisorChat),
  { ssr: false }
);

type DataSource = "demo" | "supabase";

function ageSeconds(updatedAt: number | null, now: number): number | null {
  if (updatedAt == null) return null;
  return Math.max(0, Math.floor((now - updatedAt) / 1000));
}

function formatAge(sec: number): string {
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

/** Book sync falling this far behind prices is worth calling out on its own. */
const BOOK_LAG_CALLOUT_SEC = 20;

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
    let id: number | undefined;
    const stop = () => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const start = () => {
      stop();
      // Every other interval in the app pauses on a hidden tab; this one
      // was ticking 3,600 times an hour in the background to update a
      // string that only changes once a minute after the first minute.
      if (document.hidden) return;
      id = window.setInterval(() => setNow(Date.now()), 1000);
    };
    const onVisibility = () => {
      // Resync first: the clock stopped while hidden, so the age on screen
      // is as stale as the time spent away.
      setNow(Date.now());
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const pricesSec = ageSeconds(quotesUpdatedAt, now);
  const bookSec = ageSeconds(bookSyncedAt, now);
  // Quotes and the shared-book poll both run on their own ~45s interval, so
  // under normal operation they're within a couple seconds of each other —
  // showing "book Xs ago" right next to an identical "Prices Xs ago" was
  // just the same fact twice. Only surface it once book sync has actually
  // fallen behind (a real signal something's off — e.g. Supabase hiccup
  // while quotes keep flowing fine), not as a second clock for its own sake.
  const bookLagging =
    source === "supabase" &&
    bookSec != null &&
    (pricesSec == null || bookSec - pricesSec > BOOK_LAG_CALLOUT_SEC);

  return (
    <span
      className="shrink-0 whitespace-nowrap text-xs tabular-nums text-zinc-400"
      title={
        source === "supabase"
          ? "Shared live book"
          : locked
            ? "Local demo (saved)"
            : "Local demo"
      }
    >
      {pricesSec == null ? "Prices · —" : `Prices · ${formatAge(pricesSec)}`}
      {quotesDelayed ? " · delayed" : ""}
      {bookLagging ? ` · book sync ${formatAge(bookSec)}` : ""}
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

/**
 * Resolves the `?sheet=` URL param (meta-tab keyword, slug, id, or name) to
 * an active-sheet id. Pure and synchronous so it can run both in the
 * `activeId` state initializer (first paint, before any network call) and
 * later in `pickInitialSheet` (popstate / portfolio-list changes) without
 * duplicating the matching rules in two places. Returns null when there's
 * no `sheet` param or it doesn't match anything, so callers can fall
 * through to their own next-best default (previous tab, localStorage, Overview).
 */
/**
 * Meta-tab ids that are still real top-level tabs. Pulse and Seasonality
 * moved inside Lab, so anything persisted (localStorage, history state)
 * from before that move has to fold onto Lab rather than resolving to a
 * tab that no longer renders and leaving the user on a blank page.
 */
function normalizeMetaTabId(id: string): string | null {
  if (
    id === OVERVIEW_TAB_ID ||
    id === COMPOUND_TAB_ID ||
    id === LAB_TAB_ID ||
    id === PULSE_TAB_ID
  ) {
    return id;
  }
  // Seasonality is a Lab sub-tab, so a persisted id from when it was
  // top-level folds onto Lab rather than resolving to a tab that no
  // longer renders and leaving the user on a blank page.
  if (id === SEASONALITY_TAB_ID) return LAB_TAB_ID;
  return null;
}

function resolveSheetIdFromUrl(list: Portfolio[]): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get("tab")?.trim().toLowerCase() || "";
  const portfolioParam = params.get("portfolio")?.trim().toLowerCase() || "";
  const sheetParam = params.get("sheet")?.trim().toLowerCase() || "";
  // `tab=book` is a sheet view; the actual sheet is `portfolio` / `sheet`.
  // `tab=forecast` is a panel on a sheet, not a meta tab.
  const metaTab =
    tabParam && tabParam !== "book" && tabParam !== "forecast"
      ? tabParam
      : "";
  const raw = metaTab || portfolioParam || sheetParam;
  if (!raw) return null;
  if (raw === "compound" || raw === COMPOUND_TAB_ID) {
    return COMPOUND_TAB_ID;
  }
  if (raw === "lab" || raw === LAB_TAB_ID) return LAB_TAB_ID;
  if (raw === "pulse" || raw === PULSE_TAB_ID) {
    return PULSE_TAB_ID;
  }
  // Seasonality is a Lab sub-tab. Old links still resolve, they just land
  // on Lab with the right sub-tab selected via ?labtab= below.
  if (
    raw === "statistics" ||
    raw === "stats" ||
    raw === "seasonality" ||
    raw === SEASONALITY_TAB_ID
  ) {
    return LAB_TAB_ID;
  }
  if (raw === "overview" || raw === OVERVIEW_TAB_ID) {
    return OVERVIEW_TAB_ID;
  }
  const bySlugOrId = list.find(
    (p) =>
      p.id === raw ||
      p.slug?.toLowerCase() === raw ||
      p.name.toLowerCase() === raw
  );
  return bySlugOrId?.id ?? null;
}

export function Dashboard() {
  const { push: toast } = useToast();
  const { profile, signOut, refresh, user } = useAuth();
  const router = useRouter();
  const cachedBook = readBookCache(user?.id);
  // Picked once per mount, not per render, so it doesn't shuffle mid-load.
  const [loadingMessage] = useState(pickLoadingMessage);
  const [source, setSource] = useState<DataSource>(
    cachedBook?.source ?? "demo"
  );
  const [portfolios, setPortfolios] = useState<Portfolio[]>(
    cachedBook?.portfolios ?? []
  );
  const [holdings, setHoldings] = useState<Holding[]>(
    cachedBook?.holdings ?? []
  );
  const [saveFlash, setSaveFlash] = useState(false);
  const [locked, setLocked] = useState(cachedBook?.locked ?? false);
  const [activeId, setActiveId] = useState<string>(() => {
    // URL wins on first paint too, not just after popstate/portfolio-load —
    // otherwise opening a shared "?sheet=lab" link (or any link that differs
    // from your own last-visited tab) would flash your last tab first, then
    // snap to the linked one once the async portfolio load corrects it.
    const fromUrl = resolveSheetIdFromUrl(cachedBook?.portfolios ?? []);
    if (fromUrl) return fromUrl;
    if (!cachedBook) return OVERVIEW_TAB_ID;
    const saved = loadActiveSheetId();
    if (!saved) return OVERVIEW_TAB_ID;
    const meta = normalizeMetaTabId(saved);
    if (meta) return meta;
    return cachedBook.portfolios.some((p) => p.id === saved)
      ? saved
      : OVERVIEW_TAB_ID;
  });
  // Hydrate from the last known market prices so the book's first paint is
  // a real valuation. Starting empty made calculations.ts fall back to
  // buy_price for every holding, flashing cost basis as if it were the
  // book value until the quotes request landed.
  const cachedQuotesRef = useRef(loadCachedQuotes());
  const [quotes, setQuotes] = useState<Record<string, Quote>>(
    () => cachedQuotesRef.current.quotes
  );
  const [options, setOptions] = useState<Record<string, OptionCandidate | null>>(
    {}
  );
  const [loading, setLoading] = useState(!cachedBook);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Seeded with the cache's own timestamp so "Prices · Xs ago" is honest
  // about showing older prices until the refresh lands.
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<number | null>(
    () => cachedQuotesRef.current.savedAt
  );
  const [quotesDelayed, setQuotesDelayed] = useState(false);
  const [missingTickers, setMissingTickers] = useState<string[]>([]);
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
  const [bookSyncedAt, setBookSyncedAt] = useState<number | null>(null);
  const [margusExpandSignal, setMargusExpandSignal] = useState(0);
  const [margusImagePickSignal, setMargusImagePickSignal] = useState(0);
  const [confirmResetForecast, setConfirmResetForecast] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteNudgeOpen, setInviteNudgeOpen] = useState(false);
  const hadHoldingsOnLoadRef = useRef<boolean | null>(null);
  const creatingFirstSheetRef = useRef<Promise<Portfolio | undefined> | null>(
    null
  );
  const [undoStack, setUndoStack] = useState<BookUndoSnapshot[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [labIntent, setLabIntent] = useState<LabDeepLink | null>(null);
  /** Home "Open covered calls" should land on the options table, not holdings. */
  const sheetFocusRef = useRef<"covered-calls" | null>(null);
  const { labBundle, patchLab } = useLabSync();
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
  const [ccVisibleByPortfolio, setCcVisibleByPortfolio] = useState(() =>
    loadVisibilityMap(CC_VISIBLE_KEY)
  );
  const [forecastVisibleByPortfolio, setForecastVisibleByPortfolio] = useState(
    () => loadVisibilityMap(FORECAST_VISIBLE_KEY)
  );
  const [eoyOverrides, setEoyOverrides] = useState<PortfolioEoyOverrides>({});
  const [experienceTier, setExperienceTier] = useState<ExperienceTier | null>(
    loadStoredTier
  );
  const [tierChecked, setTierChecked] = useState(false);
  // Tri-state and deliberately separate from experienceTier: null = hasn't
  // answered, true/false = explicit answer to "have you used options
  // before". A "very experienced" tier and "no options experience" are a
  // real, valid combination -- this can't be derived from the tier.
  // Options UI only appears after an explicit yes.
  const [knowsOptions, setKnowsOptions] = useState<boolean | null>(
    loadStoredKnowsOptions
  );
  const hideOptionsUI = shouldHideOptions(knowsOptions);

  // Confirm/sync against the server once — localStorage is read
  // synchronously above for an instant first paint, but the DB value is
  // the source of truth across devices (e.g. answered on phone, opens on
  // desktop next). Only real signed-in accounts get asked; demo/guest
  // preview stays exactly as-is.
  useEffect(() => {
    if (source !== "supabase" || !user) {
      setTierChecked(true);
      return;
    }
    setTierChecked(false);
    let cancelled = false;
    void fetch("/api/account/experience-tier")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            tier?: ExperienceTier | null;
            knowsOptions?: boolean | null;
          } | null
        ) => {
          if (cancelled) return;
          if (data?.tier) {
            setExperienceTier(data.tier);
            saveStoredTier(data.tier);
          }
          if (typeof data?.knowsOptions === "boolean") {
            setKnowsOptions(data.knowsOptions);
            saveStoredKnowsOptions(data.knowsOptions);
          }
        }
      )
      .catch(() => {
        /* keep whatever localStorage already had */
      })
      .finally(() => {
        if (!cancelled) setTierChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source, user]);

  // If the tier changes (questionnaire just answered, or changed later in
  // Account) and it hides whatever meta-tab is currently open, don't leave
  // the viewer stranded on a tab with no button back to it.
  useEffect(() => {
    if (!experienceTier) return;
    if (TIER_HIDDEN_META_TABS[experienceTier].includes(activeId)) {
      setActiveId(OVERVIEW_TAB_ID);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experienceTier]);

  useEffect(() => {
    if (loading || source !== "supabase") return;
    if (hadHoldingsOnLoadRef.current === null) {
      hadHoldingsOnLoadRef.current = holdings.length > 0;
    }
  }, [loading, source, holdings.length]);

  useEffect(() => {
    if (source !== "supabase" || !user?.id) return;
    if (hadHoldingsOnLoadRef.current !== false) return;
    if (holdings.length === 0) return;
    if (loadInviteNudgeDismissed(user.id)) return;
    setInviteNudgeOpen(true);
  }, [holdings.length, source, user?.id]);

  const hiddenMetaTabIds = useMemo(
    () => (experienceTier ? TIER_HIDDEN_META_TABS[experienceTier] : []),
    [experienceTier]
  );
  const labHiddenForTier = hiddenMetaTabIds.includes(LAB_TAB_ID);
  const pulseHiddenForTier = hiddenMetaTabIds.includes(PULSE_TAB_ID);

  const isOverview = activeId === OVERVIEW_TAB_ID;
  const isCompound = activeId === COMPOUND_TAB_ID;
  const isLab = activeId === LAB_TAB_ID;
  const isPulse = activeId === PULSE_TAB_ID;
  const isMetaTab = isOverview || isCompound || isLab || isPulse;

  const activePortfolio =
    isMetaTab
      ? null
      : (portfolios.find((p) => p.id === activeId) ?? null);
  const inviteSheet = activePortfolio ?? portfolios[0] ?? null;

  const ccVisible =
    hideOptionsUI
      ? false
      : activePortfolio
        ? isPanelVisible(ccVisibleByPortfolio, activePortfolio, experienceTier !== "novice")
        : true;
  // Forecast defaults to visible for every experience tier — unlike Lab/
  // Pulse/Seasonality, it's plain price-scenario modeling, not something
  // that needs "growing into."
  const forecastVisible = activePortfolio
    ? isPanelVisible(forecastVisibleByPortfolio, activePortfolio, FORECAST_DEFAULT_VISIBLE)
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

  function openSheet(id: string, focus?: "covered-calls") {
    if (focus === "covered-calls" && !hideOptionsUI) {
      const p = portfolios.find((x) => x.id === id);
      if (p) {
        setCcVisibleByPortfolio((prev) => {
          const next = setPanelVisible(prev, p, true);
          saveVisibilityMap(CC_VISIBLE_KEY, next);
          return next;
        });
        sheetFocusRef.current = "covered-calls";
      }
    } else {
      sheetFocusRef.current = null;
    }
    setActiveId(id);
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

  // Book-wide CC rows, computed once and shared by Lab (Alerts/calendar) and
  // the alert builders below — was previously an inline flatMap recomputed
  // on every render just for the Lab prop.
  const bookCoveredCallRows = useMemo(
    () =>
      portfolios.flatMap((p) => {
        const rows = holdings.filter((h) => h.portfolio_id === p.id);
        return buildSnapshot(p, rows, quotes, options).coveredCallRows;
      }),
    [portfolios, holdings, quotes, options]
  );

  const drawerCoveredCallRow = useMemo(() => {
    if (!drawerTicker || hideOptionsUI) return null;
    return (
      bookCoveredCallRows.find(
        (r) => r.holding.ticker.toUpperCase() === drawerTicker.toUpperCase()
      ) ?? null
    );
  }, [drawerTicker, bookCoveredCallRows, hideOptionsUI]);

  // Single source of truth for "what needs attention" — earnings, near
  // strike/target, margin, concentration. Lab's Alerts tab and Overview's
  // briefing both read from this one list (and its one shared dismissal
  // state) instead of each re-deriving their own copy of these conditions.
  const bookAlerts = useMemo<UpsideAlert[]>(() => {
    // No options experience -> no strike-planning alerts at all, not just
    // a de-emphasized card. These are pure covered-call mechanics.
    const strike = hideOptionsUI
      ? []
      : buildStrikeAlerts(
          bookCoveredCallRows.map((r) => ({
            ticker: r.holding.ticker,
            spot: r.spot,
            stockTarget: r.stockTarget,
            nextStrike: r.nextStrike,
          }))
        );
    const earn = buildEarningsAlerts(earningsEvents, hideOptionsUI);
    const top = [...overview.tickers].sort(
      (a, b) => b.currentValue - a.currentValue
    )[0];
    const decisions = buildDecisionAlerts({
      cash: overview.totals.cash,
      equityValue: overview.totals.equityValue,
      topTicker: top ? { ticker: top.ticker, value: top.currentValue } : null,
    });
    return [...earn, ...strike, ...decisions];
  }, [bookCoveredCallRows, earningsEvents, overview, hideOptionsUI]);

  const activeAlerts = useMemo(
    () => bookAlerts.filter((a) => !alertToastsSent.has(a.id)),
    [bookAlerts, alertToastsSent]
  );

  // Glanceable up/down dot per sheet tab. Uses the same live move Pulse
  // does (regular, pre-market, or after-hours), so the dots don't vanish
  // the moment the regular session prints $0.
  const sheetTodayTone = useMemo(() => {
    const map: Record<string, "up" | "down" | null> = {};
    for (const s of overview.sheets) {
      let dollar = 0;
      for (const h of holdings) {
        if (h.portfolio_id !== s.portfolio.id) continue;
        const q = quotes[h.ticker];
        const pct = effectiveMove(q).pct;
        if (pct == null) continue;
        const value = h.shares * (q?.price ?? h.buy_price);
        dollar += todayDollarFor(value, pct).dollar;
      }
      map[s.portfolio.id] =
        dollar > 0 ? "up" : dollar < 0 ? "down" : null;
    }
    return map;
  }, [overview.sheets, holdings, quotes]);

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
      const fromUrl = resolveSheetIdFromUrl(list);
      if (fromUrl) return fromUrl;
      if (prev) {
        const meta = normalizeMetaTabId(prev);
        if (meta) return meta;
        if (list.some((p) => p.id === prev)) return prev;
      }
      const saved = loadActiveSheetId();
      if (saved) {
        const meta = normalizeMetaTabId(saved);
        if (meta) return meta;
        if (list.some((p) => p.id === saved)) return saved;
      }
      return OVERVIEW_TAB_ID;
    },
    []
  );

  const loadPortfolios = useCallback(async (opts?: { silent?: boolean }) => {
    const userId = user?.id ?? null;
    const hasCache = Boolean(readBookCache(userId));
    // Cold start only — remounts (My book from Communities/Account) use cache.
    const showSplash = !opts?.silent && !hasCache;
    if (showSplash) {
      setLoading(true);
      setLoadError(null);
    } else {
      setLoading(false);
    }
    const ctrl = new AbortController();
    const timeout = window.setTimeout(() => ctrl.abort(), 20_000);

    const fetchBook = async () => {
      const res = await fetch("/api/portfolios", {
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Sign in required to load your book");
        }
        throw new Error(`Portfolios request failed (${res.status})`);
      }
      return res.json();
    };

    try {
      if (shouldClaimSeed(userId)) {
        await fetch("/api/auth/me", { cache: "no-store" }).catch(() => null);
        if (userId) markSeedClaimed(userId);
      }

      let data: {
        source?: string;
        portfolios?: Portfolio[];
        holdings?: Holding[];
      };
      try {
        data = await fetchBook();
      } catch (first) {
        if (
          first instanceof Error &&
          /Sign in required/i.test(first.message)
        ) {
          await refresh();
          await new Promise((r) => window.setTimeout(r, 400));
          data = await fetchBook();
        } else {
          throw first;
        }
      }

      if (data.source === "supabase") {
        const nextPortfolios = data.portfolios ?? [];
        const nextHoldings = data.holdings ?? [];
        setSource("supabase");
        setPortfolios(nextPortfolios);
        setHoldings(nextHoldings);
        setBookSyncedAt(Date.now());
        setActiveId((prev) => pickInitialSheet(nextPortfolios, prev));
        if (userId) {
          writeBookCache({
            userId,
            source: "supabase",
            portfolios: nextPortfolios,
            holdings: nextHoldings,
            locked: false,
            fetchedAt: Date.now(),
          });
        }
      } else {
        const demo = loadDemoStore();
        setSource("demo");
        setPortfolios(demo.portfolios);
        setHoldings(demo.holdings);
        setActiveId((prev) => pickInitialSheet(demo.portfolios, prev));
        const isLocked = hasLockedSave();
        setLocked(isLocked);
        if (userId) {
          writeBookCache({
            userId,
            source: "demo",
            portfolios: demo.portfolios,
            holdings: demo.holdings,
            locked: isLocked,
            fetchedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      console.error(err);
      if (showSplash) {
        const aborted =
          err instanceof DOMException && err.name === "AbortError";
        setLoadError(
          aborted
            ? "Timed out loading your book. Check the connection and retry."
            : err instanceof Error
              ? err.message
              : "Couldn’t load the shared book. Showing local demo, retry when ready."
        );
        if (!aborted && !(err instanceof Error && /Sign in/i.test(err.message))) {
          const demo = loadDemoStore();
          setSource("demo");
          setPortfolios(demo.portfolios);
          setHoldings(demo.holdings);
          setActiveId((prev) => pickInitialSheet(demo.portfolios, prev));
          setLocked(hasLockedSave());
        } else if (!hasCache) {
          setSource("supabase");
          setPortfolios([]);
          setHoldings([]);
        }
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }, [pickInitialSheet, refresh, user?.id]);

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
      const res = await fetch("/api/quotes?tickers=EURUSD%3DX");
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
          const quotesRes = await fetch(quotesUrl(tickers));
          if (!quotesRes.ok) {
            setQuotesDelayed(true);
            throw new Error(`Quotes request failed (${quotesRes.status})`);
          }
          const quotesJson = await quotesRes.json();
          const incoming = (quotesJson.quotes ?? {}) as Record<string, Quote>;
          const missing = (quotesJson.missing ?? []) as string[];
          let merged = incoming;
          setQuotes((prev) => {
            merged = mergeQuotes(prev, incoming);
            nextQuotes = merged;
            return merged;
          });
          saveCachedQuotes(merged);
          setQuotesUpdatedAt(Date.now());
          setQuotesDelayed(Boolean(quotesJson.delayed) || missing.length > 0);
          setMissingTickers(missing);
          applyFxPayload(quotesJson.fx);
        }

        // No options experience -> don't even fetch options-chain data;
        // the panel that would show it never renders for these viewers.
        if (opts?.quotesOnly || hideOptionsUI) {
          if (hideOptionsUI) setOptions({});
          return;
        }

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
    [applyFxPayload, refreshFx, hideOptionsUI]
  );

  useEffect(() => {
    void refreshFx();
    const id = window.setInterval(() => {
      if (document.hidden) return;
      void refreshFx();
    }, 120_000);
    return () => window.clearInterval(id);
  }, [refreshFx]);

  useEffect(() => {
    const cached = readBookCache(user?.id);
    void loadPortfolios({ silent: Boolean(cached) });
  }, [loadPortfolios, user?.id]);

  // Keep session cache warm so My book remounts paint instantly.
  useEffect(() => {
    if (loading || !user?.id) return;
    if (source === "supabase" && portfolios.length === 0) return;
    writeBookCache({
      userId: user.id,
      source,
      portfolios,
      holdings,
      locked,
      fetchedAt: Date.now(),
    });
  }, [portfolios, holdings, source, locked, user?.id, loading]);

  // Personal daily-visit streak — device-local, counts once per Tallinn day
  // regardless of which tab loads first.
  useEffect(() => {
    const { justHitMilestone } = recordVisitToday();
    if (justHitMilestone) toast(milestoneToast(justHitMilestone), "success");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per app load
  }, []);

  // Warm Margus's chunk once the page is idle. Keeps him off the critical
  // path without making the first click wait on a download.
  useEffect(() => {
    const warm = () => void import("@/components/CcAdvisorChat");
    const idle = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (idle) {
      idle(warm, { timeout: 3000 });
      return;
    }
    const id = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(id);
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

  /**
   * A new tab starts at the top. Switching tabs swaps the whole page body
   * but leaves the window scrolled wherever the previous tab was, so going
   * from halfway down Overview to Compound dropped you into the middle of
   * it. Skipped on back/forward, where the browser restores the position
   * you actually left.
   */
  const scrollResetSkipRef = useRef(true);
  useEffect(() => {
    if (scrollResetSkipRef.current) {
      scrollResetSkipRef.current = false;
      return;
    }
    if (historyFromPopRef.current) return;
    if (sheetFocusRef.current) return;
    window.scrollTo({ top: 0 });
  }, [activeId]);

  useEffect(() => {
    if (sheetFocusRef.current !== "covered-calls") return;
    if (!ccVisible) return;
    const t = window.setTimeout(() => {
      document
        .getElementById(COVERED_CALLS_ANCHOR)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
      sheetFocusRef.current = null;
    }, 80);
    return () => window.clearTimeout(t);
  }, [activeId, ccVisible]);

  useEffect(() => {
    saveActiveSheetId(activeId);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("sheet");
    url.searchParams.delete("tab");
    url.searchParams.delete("portfolio");
    if (activeId === OVERVIEW_TAB_ID) {
      /* overview is the default; keep the URL clean */
    } else if (activeId === COMPOUND_TAB_ID) {
      url.searchParams.set("tab", "compound");
    } else if (activeId === LAB_TAB_ID) {
      url.searchParams.set("tab", "lab");
    } else if (activeId === PULSE_TAB_ID) {
      url.searchParams.set("tab", "pulse");
    } else {
      const p = portfolios.find((x) => x.id === activeId);
      url.searchParams.set("tab", "book");
      url.searchParams.set("portfolio", p?.slug || activeId);
      url.searchParams.set("sheet", p?.slug || activeId);
    }
    // Drop legacy guest/share query params if present.
    url.searchParams.delete("share");
    url.searchParams.delete("view");
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
  }, [activeId, portfolios]);

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
        const meta = normalizeMetaTabId(fromState);
        if (meta || portfolios.some((p) => p.id === fromState)) {
          setActiveId(meta ?? fromState);
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
        if (user?.id) {
          writeBookCache({
            userId: user.id,
            source: "supabase",
            portfolios: nextP,
            holdings: nextH,
            locked: false,
            fetchedAt: Date.now(),
          });
        }
        toast("Book updated elsewhere, synced", "info");
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

  /**
   * Live price poll. Cadence follows the New York clock rather than a flat 45s:
   * out of hours the same close comes back every time, and the quote chain is
   * a shared free tier. Options stay on demand.
   *
   * Holdings are read through a ref so editing the book doesn't tear the timer
   * down and start the interval over.
   */
  const pollRowsRef = useRef({ holdings, isMetaTab, portfolioId: activePortfolio?.id });
  pollRowsRef.current = { holdings, isMetaTab, portfolioId: activePortfolio?.id };

  useEffect(() => {
    if (allTickers.length === 0) return;

    let cancelled = false;
    let timer = 0;

    const tick = () => {
      if (cancelled || document.hidden) return;
      const { holdings: rowsAll, isMetaTab: meta, portfolioId } =
        pollRowsRef.current;
      const rows = meta
        ? rowsAll
        : rowsAll.filter((h) => h.portfolio_id === portfolioId);
      void refreshMarkets(allTickers, rows, undefined, {
        quotesOnly: true,
        silent: true,
      });
    };

    // Re-armed each cycle so the cadence changes when the session does,
    // instead of being fixed at whatever it was when the tab opened.
    const schedule = () => {
      timer = window.setTimeout(() => {
        tick();
        schedule();
      }, quotePollMs());
    };
    tick();
    schedule();

    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // ticker identity via allTickersKey fingerprint
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allTickers covered by key
  }, [allTickersKey, refreshMarkets]);

  async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> | undefined),
    };
    if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetch(input, { ...init, headers });
  }

  function handleSave(values: HoldingFormValues) {
    if (!activePortfolio) return;

    const ticker = normalizeYahooTicker(values.ticker);
    const sortOrder =
      holdings.filter((h) => h.portfolio_id === activePortfolio.id).length + 1;
    const existing = holdings.find(
      (h) =>
        h.portfolio_id === activePortfolio.id &&
        h.ticker.toUpperCase() === ticker
    );
    const optimistic: Holding = existing
      ? {
          ...existing,
          shares: values.shares,
          buy_price: values.buy_price,
          target_call_pct: values.target_call_pct,
        }
      : {
          id: `tmp-${crypto.randomUUID()}`,
          portfolio_id: activePortfolio.id,
          ticker,
          shares: values.shares,
          buy_price: values.buy_price,
          eoy_target: null,
          target_call_pct: values.target_call_pct,
          stock_target_override: null,
          sort_order: sortOrder,
        };

    setHoldings((prev) => {
      if (existing) {
        return prev.map((h) => (h.id === existing.id ? optimistic : h));
      }
      return [...prev, optimistic];
    });
    setModalOpen(false);
    toast("Holding saved", "success");
    track("holding_added", { ticker });
    void refreshMarkets(
      [ticker],
      holdings
        .filter((h) => h.portfolio_id === activePortfolio.id)
        .concat(optimistic)
    );

    if (source === "supabase") {
      void (async () => {
        const res = await apiFetch("/api/holdings", {
          method: "POST",
          body: JSON.stringify({
            ...values,
            ticker,
            portfolio_id: activePortfolio.id,
            sort_order: sortOrder,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          holding?: Holding;
        };
        if (!res.ok) {
          setHoldings((prev) => {
            if (existing) {
              return prev.map((h) => (h.id === existing.id ? existing : h));
            }
            return prev.filter((h) => h.id !== optimistic.id);
          });
          toast(
            typeof data.error === "string"
              ? data.error
              : "Could not save holding, reverted",
            "error"
          );
          return;
        }
        if (data.holding) {
          const saved = data.holding;
          setHoldings((prev) => {
            const withoutTemp = prev.filter((h) => h.id !== optimistic.id);
            const exists = withoutTemp.some((h) => h.id === saved.id);
            return exists
              ? withoutTemp.map((h) => (h.id === saved.id ? saved : h))
              : [...withoutTemp, saved];
          });
        }
      })();
      return;
    }

    const store = loadDemoStore();
    const next = upsertHolding(store, {
      ...values,
      eoy_target: null,
      stock_target_override: null,
      portfolio_id: activePortfolio.id,
      sort_order: sortOrder,
    });
    setPortfolios(next.portfolios);
    setHoldings(next.holdings);
  }

  function handlePatch(patch: HoldingPatch): boolean {
    const { id, ...fields } = patch;
    const previous = holdings.find((h) => h.id === id);

    // Clear stale option when strike-driving fields change
    if (
      fields.target_call_pct !== undefined ||
      fields.stock_target_override !== undefined
    ) {
      const ticker = previous?.ticker;
      if (ticker) {
        setOptions((prev) => ({ ...prev, [ticker]: null }));
      }
    }

    // Optimistic: apply immediately so every keystroke commit feels instant,
    // regardless of Supabase round-trip time. Background request rolls the
    // field back (via the same setHoldings the UI already reads from) and
    // toasts on failure instead of making the input wait.
    setHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, ...fields } : h))
    );

    if (source === "supabase") {
      void (async () => {
        const res = await apiFetch("/api/holdings", {
          method: "PATCH",
          body: JSON.stringify({ id, ...fields }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (previous) {
            setHoldings((prev) =>
              prev.map((h) => (h.id === id ? previous : h))
            );
          }
          toast(
            typeof data.error === "string"
              ? data.error
              : "Failed to update holding, reverted",
            "error"
          );
        }
      })();
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

  /**
   * First-run actions fire from Overview, which is a meta-tab with no
   * active sheet, and every write path bails out without one (handleSave
   * returns early on a null activePortfolio). Create the first sheet if
   * needed, then switch to it so the import lands where they can see it.
   */
  const startFirstRunAction = useCallback(
    (kind: "manual" | "csv" | "screenshot") => {
      void (async () => {
        const target = await ensureFirstSheet();
        if (!target) return;
        if (activeId !== target.id) setActiveId(target.id);
        if (kind === "manual") setModalOpen(true);
        else if (kind === "csv") setCsvImportOpen(true);
        else setMargusImagePickSignal((n) => n + 1);
      })();
    },
    // ensureFirstSheet is a function declaration in this component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, portfolios]
  );

  const handleCsvImport = useCallback(
    (input: { rows: CsvHoldingRow[]; cash: number | null; replace: boolean }) => {
      if (input.rows.length === 0 && input.cash == null) return;
      track("csv_import", { rows: input.rows.length, replace: input.replace });
      applyAdvisorActions([
        {
          action: "import_sheet",
          cash: input.cash,
          replace: input.replace,
          holdings: input.rows.map((r) => ({
            ticker: r.ticker,
            shares: r.shares,
            buyPrice: r.buyPrice,
            callPct: r.callPct ?? STRATEGY.defaultCallPct,
          })),
        },
      ]);
    },
    [applyAdvisorActions]
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

  function deleteHoldingById(id: string): boolean {
    const removed = holdings.find((h) => h.id === id);
    if (source === "supabase") {
      // Optimistic — gone from the table immediately; restored + toasted if
      // the delete actually fails server-side.
      setHoldings((prev) => prev.filter((h) => h.id !== id));
      void (async () => {
        const res = await apiFetch(`/api/holdings?id=${id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (removed) {
            setHoldings((prev) => [...prev, removed]);
          }
          toast(
            typeof data.error === "string"
              ? data.error
              : "Failed to delete holding, restored",
            "error"
          );
          return;
        }
      })();
    } else {
      const next = deleteHolding(loadDemoStore(), id);
      setHoldings(next.holdings);
    }
    toast("Holding deleted", "success");
    return true;
  }

  async function handleAddSheet(
    name: string,
    opts?: { silent?: boolean }
  ): Promise<Portfolio | undefined> {
    const isFirstSheet = portfolios.length === 0;
    if (source === "supabase") {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(
          typeof data.error === "string" ? data.error : "Failed to add sheet",
          "error"
        );
        return undefined;
      }
      const created = data.portfolio as Portfolio;
      setPortfolios((prev) => [...prev, created]);
      seedNewSheetPanelDefaults(created);
      setActiveId(created.id);
      track("sheet_created", { first_sheet: isFirstSheet });
      if (!opts?.silent) toast("Sheet added", "success");
      return created;
    }
    const next = addPortfolio(loadDemoStore(), name);
    setPortfolios(next.portfolios);
    const created = next.portfolios[next.portfolios.length - 1];
    seedNewSheetPanelDefaults(created);
    setActiveId(created.id);
    track("sheet_created", { first_sheet: isFirstSheet });
    if (!opts?.silent) toast("Sheet added", "success");
    return created;
  }

  async function ensureFirstSheet(): Promise<Portfolio | undefined> {
    if (portfolios[0]) return portfolios[0];
    if (creatingFirstSheetRef.current) return creatingFirstSheetRef.current;
    const pending = handleAddSheet(FIRST_SHEET_NAME, { silent: true });
    creatingFirstSheetRef.current = pending;
    try {
      return await pending;
    } finally {
      creatingFirstSheetRef.current = null;
    }
  }

  function handleRenameSheet(id: string, name: string) {
    const previousName = portfolios.find((p) => p.id === id)?.name;
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
    setRenameTarget(null);
    toast("Sheet renamed", "success");

    if (source === "supabase") {
      void (async () => {
        const res = await apiFetch("/api/portfolios", {
          method: "PATCH",
          body: JSON.stringify({ id, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (previousName != null) {
            setPortfolios((prev) =>
              prev.map((p) => (p.id === id ? { ...p, name: previousName } : p))
            );
          }
          toast(
            typeof data.error === "string"
              ? data.error
              : "Failed to rename sheet, reverted",
            "error"
          );
        }
      })();
    } else {
      renamePortfolio(loadDemoStore(), id, name);
    }
  }

  async function deleteSheetById(id: string): Promise<boolean> {
    if (source === "supabase") {
      const res = await apiFetch(`/api/portfolios?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(
          typeof data.error === "string" ? data.error : "Failed to delete sheet",
          "error"
        );
        return false;
      }
      clearChatHistory(id);
      // Server already confirmed the delete — drop it locally instead of a
      // full reload round-trip for data we already know is gone.
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      setHoldings((prev) => prev.filter((h) => h.portfolio_id !== id));
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

  function handleSaveCash(cash: number) {
    if (!activePortfolio) return;
    const portfolioId = activePortfolio.id;
    const previousCash = activePortfolio.cash_balance;

    if (source === "demo") {
      const next = updateCash(loadDemoStore(), portfolioId, cash);
      setPortfolios(next.portfolios);
    } else {
      // Optimistic — close the modal and show the new number immediately;
      // roll back + toast if the write actually fails in the background.
      setPortfolios((prev) =>
        prev.map((p) => (p.id === portfolioId ? { ...p, cash_balance: cash } : p))
      );
      void (async () => {
        const res = await apiFetch("/api/portfolios", {
          method: "PATCH",
          body: JSON.stringify({ id: portfolioId, cash_balance: cash }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setPortfolios((prev) =>
            prev.map((p) =>
              p.id === portfolioId ? { ...p, cash_balance: previousCash } : p
            )
          );
          toast(
            typeof data.error === "string"
              ? data.error
              : "Failed to update cash, reverted",
            "error"
          );
        }
      })();
    }
    setCashModalOpen(false);
    toast("Cash updated", "success");
  }

  function resetDemo() {
    // v1–v7 are legacy schema versions; v8 is today's STORAGE_KEY in
    // demo-store.ts — included here on purpose so Reset fully reseeds it.
    // Do NOT remove portfell-locked — Reset restores the last Save.
    for (let v = 1; v <= 8; v++) {
      localStorage.removeItem(`portfell-demo-v${v}`);
    }
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

  const overviewTickerKey = overview.tickers
    .map((t) => t.ticker)
    .slice(0, 40)
    .join(",");
  useEffect(() => {
    if (!overviewTickerKey) return;
    let cancelled = false;

    const load = () => {
      void fetch(
        `/api/market/events?tickers=${encodeURIComponent(overviewTickerKey)}`
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          const events = Array.isArray(data.earnings) ? data.earnings : [];
          setEarningsEvents(events);
        })
        .catch(() => {
          /* keep whatever was already loaded */
        });
    };

    load();
    // Hourly background refresh, no market-session gating — pre-market and
    // after-hours refresh the same as regular trading hours. Skipped while
    // the tab is hidden; resumes on the next tick once visible again.
    const id = window.setInterval(() => {
      if (!document.hidden) load();
    }, PULSE_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [overviewTickerKey]);

  useEffect(() => {
    const prev = alertToastsSentRef.current;
    const fresh = bookAlerts.filter((a) => !prev.has(a.id));
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
  }, [bookAlerts, toast]);

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
        label: "Pulse: thesis check",
        group: "Go",
        hint: "Big movers",
        run: () => setActiveId(PULSE_TAB_ID),
      },
      {
        id: "statistics",
        label: "Seasonality",
        group: "Go",
        hint: "In Lab · year & calendar patterns",
        run: () => {
          setLabIntent("seasonality");
          setActiveId(LAB_TAB_ID);
        },
      },
    ];
    items.push({
      id: "lab",
      label: "Lab",
      group: "Go",
      hint: "Analysis tools",
      run: () => setActiveId(LAB_TAB_ID),
    });
    items.push({
      id: "undo",
      label: "Undo last Margus write",
      group: "Edit",
      run: () => undoLastMargusWrite(),
    });
    items.push({
      id: "snapshots",
      label: "Snapshots",
      group: "Edit",
      run: () => setSnapshotsOpen(true),
    });
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
  }, [portfolios, overview.tickers, undoStack.length]);

  // Page-level view toggles for the current sheet — kept separate from
  // account actions below so one menu isn't a junk drawer of unrelated
  // things. Doesn't duplicate Communities/My account: those are already
  // one click away via WorkspaceSwitcher right next to this. Command
  // palette isn't listed here — ⌘K already opens it globally (see the
  // keydown listener below), so a menu entry was just a redundant, often
  // lone item making this button show up for no reason.
  const viewMenuItems: HeaderMenuItem[] = useMemo(() => {
    const items: HeaderMenuItem[] = [];
    if (undoStack.length > 0) {
      items.push({
        id: "undo",
        label: "Undo Margus write",
        onSelect: () => undoLastMargusWrite(),
      });
    }
    if (!isMetaTab) {
      if (source === "supabase" && activePortfolio) {
        items.push({
          id: "invite",
          label: "Invite a partner",
          onSelect: () => setInviteOpen(true),
        });
      }
      if (!hideOptionsUI) {
        items.push({
          id: "cc",
          label: ccVisible ? "Hide covered calls" : "Show covered calls",
          onSelect: () => toggleCcVisible(),
        });
      }
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
    undoStack.length,
    source,
    isMetaTab,
    ccVisible,
    hideOptionsUI,
    forecastVisible,
    saveFlash,
    locked,
    activePortfolio?.id,
  ]);

  // Account-scoped actions. Rooms are Book/Fund/Communities; Account
  // lives here so it isn't a second tab next to the avatar.
  const accountMenuItems: HeaderMenuItem[] = useMemo(() => {
    if (source !== "supabase") return [];
    return [
      {
        id: "account",
        label: "Account",
        onSelect: () => router.push("/account"),
      },
      {
        id: "snapshots",
        label: "Snapshots",
        onSelect: () => setSnapshotsOpen(true),
      },
      {
        id: "signout",
        label: "Sign out",
        onSelect: () =>
          void signOut().then(() => {
            clearBookCache();
            router.push("/");
            router.refresh();
          }),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menu chrome deps only
  }, [source]);

  const accountEnd =
    source === "supabase" ? (
      <HeaderOverflowMenu
        items={accountMenuItems}
        label={profile?.display_name || user?.email || "Account"}
        avatar={{
          url: profile?.avatar_url,
          initial: (profile?.display_name || user?.email || "?")
            .trim()
            .charAt(0)
            .toUpperCase(),
        }}
      />
    ) : null;

  const missingQuoteTickers = missingTickers;

  if (loading) {
    return <DashboardLoading message={loadingMessage} />;
  }

  if (!isMetaTab && (!activePortfolio || !snapshot)) {
    return (
      <div className="flex min-h-dvh flex-col bg-app text-zinc-100">
        <AppHeader
          onBrandClick={() => setActiveId(OVERVIEW_TAB_ID)}
          brandTitle="Upside Lab: go to Overview"
          showWorkspaceNav={source === "supabase"}
          title="Overview"
          end={accountEnd}
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(ellipse_at_top,_#16120c_0%,_#0C1014_52%)] text-zinc-100 [--dock-pad:7.25rem] sm:[--dock-pad:5.5rem]">
      <StaleQuotesBanner
        delayed={quotesDelayed}
        updatedAt={quotesUpdatedAt}
        missingTickers={missingQuoteTickers}
      />
      <AppHeader
        onBrandClick={() => setActiveId(OVERVIEW_TAB_ID)}
        brandTitle="Upside Lab: go to Overview"
        showWorkspaceNav={source === "supabase"}
        title={
          isOverview
            ? "Overview"
            : isCompound
              ? "Compound"
              : isLab
                ? "Lab"
                : isPulse
                  ? "Pulse"
                  : activePortfolio!.name
        }
        end={accountEnd}
      >
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
              title={isLab ? "Fetch prices and option quotes now" : "Fetch prices now"}
              aria-label="Refresh prices"
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
                className="btn-primary h-8 min-h-8 rounded-md px-2.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Add holding</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
            {!isMetaTab && source === "supabase" && activePortfolio && (
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="hidden h-8 items-center gap-1 rounded-md border border-zinc-700 px-2.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white md:inline-flex"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Invite</span>
              </button>
            )}
            <HeaderOverflowMenu
              items={viewMenuItems}
              label="View"
              icon={SlidersHorizontal}
            />
      </AppHeader>

      {/* Status strip, below the header rather than inside it, so the bar
        * itself stays exactly one fixed height on every page. */}
      <div className="border-b border-brand-deep/25 bg-app/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-1 px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-2">
          <PricesAgeStatus
            quotesUpdatedAt={quotesUpdatedAt}
            quotesDelayed={quotesDelayed}
            bookSyncedAt={bookSyncedAt}
            source={source}
            locked={locked}
          />
          <MacroStrip />
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-3 py-4 pb-[calc(var(--dock-pad)+env(safe-area-inset-bottom))] sm:gap-5 sm:px-4 sm:py-6">
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

        {isPulse ? (
          <PulsePage
            model={overview}
            quotes={quotes}
            convictions={convictionMap}
            onWriteThesis={(t) => setDrawerTicker(t)}
          />
        ) : isLab ? (
          <LabSheet
            overview={overview}
            portfolios={portfolios}
            holdings={holdings}
            quotes={quotes}
            intentTab={labIntent}
            onIntentConsumed={() => setLabIntent(null)}
            hiddenTabs={
              experienceTier ? TIER_HIDDEN_LAB_TABS[experienceTier] : []
            }
          />
        ) : isCompound ? (
          <CompoundInterestSheet
            bookValue={overview.totals.totalValue}
            sheets={overview.sheets.map((s) => ({
              id: s.portfolio.id,
              name: s.portfolio.name,
              value: s.totalValue,
            }))}
            tickerValues={overview.tickers.map((t) => ({
              ticker: t.ticker,
              value: t.currentValue,
            }))}
            bookCash={overview.totals.cash}
            eurUsd={eurUsd}
            eurUsdDetail={eurUsdDetail}
            hideOptions={hideOptionsUI}
          />
        ) : isOverview ? (
          <>
            <OverviewDashboard
              model={overview}
              onOpenSheet={openSheet}
              coveredCallRows={bookCoveredCallRows}
              activeAlerts={activeAlerts}
              marketState={marketState}
              showCommunities={source === "supabase"}
              hideOptions={hideOptionsUI}
              onAddHolding={() => startFirstRunAction("manual")}
              onImportScreenshot={() => startFirstRunAction("screenshot")}
              onImportCsv={() => startFirstRunAction("csv")}
              onAskMargus={() => setMargusExpandSignal((n) => n + 1)}
              onOpenLab={
                labHiddenForTier
                  ? undefined
                  : (tab) => {
                      if (tab) setLabIntent(tab);
                      setActiveId(LAB_TAB_ID);
                    }
              }
              onOpenPulse={
                pulseHiddenForTier ? undefined : () => setActiveId(PULSE_TAB_ID)
              }
              onOpenCompound={() => setActiveId(COMPOUND_TAB_ID)}
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
              onImportScreenshot={() =>
                setMargusImagePickSignal((n) => n + 1)
              }
              onImportCsv={() => setCsvImportOpen(true)}
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

            {forecastVisible ? (
              forecast &&
              activePortfolio && (
                <ForecastPanel
                  model={forecast}
                  portfolioId={activePortfolio.id}
                  portfolioName={activePortfolio.name}
                  cashBalance={activePortfolio.cash_balance}
                  overrides={eoyOverrides}
                  onSetEoyPrice={commitEoyPrice}
                  onApplyMargusPaths={applyMargusEoyPaths}
                  onClearOverrides={() => setConfirmResetForecast(true)}
                  convictions={convictionMap}
                />
              )
            ) : (
              <ForecastOffStub onShow={() => toggleForecastVisible()} />
            )}
          </>
        )}
      </main>

      <PortfolioTabs
        portfolios={portfolios}
        activeId={activeId}
        onChange={setActiveId}
        onAdd={handleAddSheet}
        sheetTodayTone={sheetTodayTone}
        hiddenModeIds={hiddenMetaTabIds}
        onRenameRequest={(id, name) => setRenameTarget({ id, name })}
        onDeleteRequest={(id, name) =>
          setConfirmDelete({ kind: "sheet", id, label: name })
        }
      />

      <HoldingModal
        open={modalOpen}
        portfolioName={inviteSheet?.name ?? ""}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        hideCallPct={hideOptionsUI}
      />

      <CsvImportModal
        open={csvImportOpen}
        portfolioName={inviteSheet?.name ?? ""}
        onClose={() => setCsvImportOpen(false)}
        onImport={handleCsvImport}
        hideCallPct={hideOptionsUI}
      />

      {inviteSheet && (
        <InvitePartnerModal
          open={inviteOpen}
          portfolioId={inviteSheet.id}
          portfolioName={inviteSheet.name}
          onClose={() => setInviteOpen(false)}
        />
      )}

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
            ? `Delete “${confirmDelete.label}” and all of its holdings? A safety snapshot is saved first.`
            : `Remove ${confirmDelete?.label ?? "this holding"} from the sheet?`
        }
        confirmLabel="Delete"
        destructive
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return false;
          if (confirmDelete.kind === "sheet") {
            return deleteSheetById(confirmDelete.id);
          }
          return deleteHoldingById(confirmDelete.id);
        }}
      />

      <ConfirmModal
        open={inviteNudgeOpen}
        title="Invite someone onto this sheet"
        body="Your book is in. A partner can see and edit it with you. Optional, and you can do this later from the sheet menu."
        confirmLabel="Invite"
        cancelLabel="Not now"
        onClose={() => {
          if (user?.id) saveInviteNudgeDismissed(user.id);
          setInviteNudgeOpen(false);
        }}
        onConfirm={() => {
          if (user?.id) saveInviteNudgeDismissed(user.id);
          setInviteNudgeOpen(false);
          setInviteOpen(true);
        }}
      />

      <ConfirmModal
        open={confirmResetForecast}
        title="Reset forecast overrides?"
        body={`Clears every manual and Margus-generated EOY price target on ${
          activePortfolio?.name ?? "this sheet"
        }. Margus will need to re-reason the whole forecast from scratch on next visit. This can't be undone.`}
        confirmLabel="Reset"
        destructive
        onClose={() => setConfirmResetForecast(false)}
        onConfirm={() => {
          clearEoyOverrides();
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

      {tierChecked && !experienceTier && source === "supabase" && user && (
        <ExperienceOnboardingModal
          onDone={(tier, knows) => {
            setExperienceTier(tier);
            setKnowsOptions(knows);
            track("experience_tier_set", { tier, knowsOptions: knows });
          }}
        />
      )}

      <CommandPalette
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        items={commandItems}
      />

      <CostBasisModal
        open={costBasisOpen}
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
        todayChangePct={
          drawerTicker ? quotes[drawerTicker]?.changePercent ?? null : null
        }
        conviction={
          drawerTicker
            ? convictionMap[drawerTicker.toUpperCase()] ?? null
            : null
        }
        overrides={eoyOverrides}
        coveredCallRow={drawerCoveredCallRow}
        onSetEoyPrice={commitEoyPrice}
        onConviction={(level, thesis) => {
          if (!drawerTicker) return;
          patchLab({
            conviction: setConviction(convictionMap, drawerTicker, {
              level,
              thesis,
            }),
          });
        }}
        onClose={() => setDrawerTicker(null)}
        onAskMargus={() => {
          setMargusExpandSignal((n) => n + 1);
        }}
      />

      <CcAdvisorChat
        key={
          !isMetaTab && activePortfolio && snapshot
            ? activePortfolio.id
            : OVERVIEW_TAB_ID
        }
        portfolioId={
          !isMetaTab && activePortfolio && snapshot
            ? activePortfolio.id
            : OVERVIEW_TAB_ID
        }
        expandSignal={margusExpandSignal}
        imagePickSignal={margusImagePickSignal}
        onSuggestCsv={() => setCsvImportOpen(true)}
        onApplyActions={
          !isMetaTab && activePortfolio && snapshot
            ? applyAdvisorActions
            : () => {
                /* advise-only on Overview / Lab / Pulse / Compound */
              }
        }
        context={
          !isMetaTab && activePortfolio && snapshot
            ? {
                portfolioName: activePortfolio.name,
                cashBalance: activePortfolio.cash_balance,
                hideOptions: hideOptionsUI,
                eurUsd,
                gbpUsd,
                watchlist: loadWatchlist(),
                holdings: snapshot.holdings.map((h) => ({
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
                rows: hideOptionsUI
                  ? []
                  : snapshot.coveredCallRows.map((r) => ({
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
                  cost: snapshot.totals.buyValue,
                  value: snapshot.totals.currentValue,
                  roiPct: snapshot.totals.roiPct,
                  roiDollar: snapshot.totals.roiDollar,
                  yield2wAvg: snapshot.totals.yield2wAvg,
                  premiumTotal: snapshot.totals.premiumTotal,
                },
                otherPortfolios: portfolios
                  .filter((p) => p.id !== activePortfolio.id)
                  .map((p) => ({
                    name: p.name,
                    cashBalance: p.cash_balance,
                    holdings: holdings
                      .filter((h) => h.portfolio_id === p.id)
                      .map((h) => ({
                        ticker: h.ticker,
                        shares: h.shares,
                        buyPrice: h.buy_price,
                        callPct: hideOptionsUI ? undefined : h.target_call_pct,
                        stockTarget: hideOptionsUI
                          ? undefined
                          : h.stock_target_override,
                      })),
                  })),
              }
            : {
                portfolioName: "Overview",
                cashBalance: overview.totals.cash,
                adviseOnly: true,
                hideOptions: hideOptionsUI,
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
                      callPct: hideOptionsUI ? undefined : h.target_call_pct,
                      stockTarget: hideOptionsUI
                        ? undefined
                        : h.stock_target_override,
                    })),
                })),
              }
        }
      />
    </div>
  );
}
