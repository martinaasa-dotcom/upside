"use client";

import { CashModal } from "@/components/CashModal";
import { CcAdvisorChat, type AdvisorAction } from "@/components/CcAdvisorChat";
import { CoveredCallPanel } from "@/components/CoveredCallPanel";
import { ForecastPanel } from "@/components/ForecastPanel";
import { HoldingModal, type HoldingFormValues } from "@/components/HoldingModal";
import { CompoundInterestSheet } from "@/components/CompoundInterestSheet";
import { OverviewDashboard } from "@/components/OverviewDashboard";
import {
  PortfolioTable,
  type HoldingPatch,
} from "@/components/PortfolioTable";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { RenameSheetModal } from "@/components/RenameSheetModal";
import { UpsideLogo } from "@/components/UpsideLogo";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { SnapshotsModal } from "@/components/SnapshotsModal";
import { useToast } from "@/components/ui/Toast";
import { buildSnapshot } from "@/lib/calculations";
import { clearChatHistory } from "@/lib/chat-history";
import { OwnerUnlockModal } from "@/components/OwnerUnlockModal";
import {
  getSessionPin,
  loadActiveSheetId,
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
import { COMPOUND_TAB_ID, OVERVIEW_TAB_ID, buildOverview } from "@/lib/overview";
import type {
  Holding,
  OptionCandidate,
  Portfolio,
  Quote,
} from "@/lib/types";
import { Eye, EyeOff, History, Lock, Plus, RefreshCw, Save } from "lucide-react";
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
  const [nowTick, setNowTick] = useState(() => Date.now());
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
  const [bookUnlocked, setBookUnlocked] = useState(false);
  const [bookSyncedAt, setBookSyncedAt] = useState<number | null>(null);
  const [margusExpandSignal, setMargusExpandSignal] = useState(0);
  const [mobileMargusCollapsed] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const bookRef = useRef({ portfolios, holdings });
  bookRef.current = { portfolios, holdings };
  const [ccVisibleByPortfolio, setCcVisibleByPortfolio] = useState(() =>
    loadVisibilityMap(CC_VISIBLE_KEY)
  );
  const [forecastVisibleByPortfolio, setForecastVisibleByPortfolio] = useState(
    () => loadVisibilityMap(FORECAST_VISIBLE_KEY)
  );
  const [eoyOverrides, setEoyOverrides] = useState<PortfolioEoyOverrides>({});

  const isOverview = activeId === OVERVIEW_TAB_ID;
  const isCompound = activeId === COMPOUND_TAB_ID;
  const activePortfolio =
    isOverview || isCompound
      ? null
      : (portfolios.find((p) => p.id === activeId) ?? null);

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

  useEffect(() => {
    if (!activePortfolio) {
      setEoyOverrides({});
      return;
    }
    setEoyOverrides(loadEoyOverrides(activePortfolio.id));
  }, [activePortfolio?.id]);

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
          list.some((p) => p.id === prev))
      ) {
        return prev;
      }
      const saved = loadActiveSheetId();
      if (
        saved &&
        (saved === OVERVIEW_TAB_ID ||
          saved === COMPOUND_TAB_ID ||
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
          "Couldn’t load the shared book. Showing local demo — retry when ready."
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
    []
  );

  useEffect(() => {
    void loadPortfolios();
    const pin = getSessionPin();
    if (pin) {
      void fetch("/api/owner/verify", {
        method: "POST",
        headers: ownerPinHeaders(pin),
      }).then((res) => {
        if (res.ok) setBookUnlocked(true);
      });
    }
  }, [loadPortfolios]);

  useEffect(() => {
    saveActiveSheetId(activeId);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (activeId === OVERVIEW_TAB_ID) {
      url.searchParams.delete("sheet");
    } else if (activeId === COMPOUND_TAB_ID) {
      url.searchParams.set("sheet", "compound");
    } else {
      const p = portfolios.find((x) => x.id === activeId);
      if (p?.slug) url.searchParams.set("sheet", p.slug);
      else url.searchParams.set("sheet", activeId);
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [activeId, portfolios]);

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
        toast("Book updated elsewhere — synced", "info");
      } catch {
        /* ignore */
      }
    };

    const id = window.setInterval(() => void tick(), 45_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ccSignature = portfolioHoldings
    .map(
      (h) =>
        `${h.id}:${h.ticker}:${h.shares}:${h.target_call_pct}:${h.stock_target_override ?? ""}`
    )
    .join("|");

  // Quotes for every ticker (overview + sheet views); options only on a sheet
  useEffect(() => {
    if (holdings.length === 0) return;
    if (isOverview || isCompound) {
      void refreshMarkets(allTickers, holdings, undefined, {
        quotesOnly: true,
      });
      return;
    }
    if (!activePortfolio) return;
    const rows = holdings.filter((h) => h.portfolio_id === activePortfolio.id);
    void refreshMarkets(allTickers, rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePortfolio?.id, isOverview, isCompound, ccSignature, allTickers.join(","), refreshMarkets]);

  // Free Yahoo poll: prices every 45s while the tab is visible (options stay on demand)
  useEffect(() => {
    if (allTickers.length === 0) return;

    const POLL_MS = 45_000;
    let cancelled = false;

    const tick = () => {
      if (cancelled || document.hidden) return;
      const rows =
        isOverview || isCompound
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
  }, [
    activePortfolio?.id,
    isOverview,
    isCompound,
    allTickers.join(","),
    holdings,
    refreshMarkets,
  ]);

  async function ensureBookPin(): Promise<string | null> {
    const existing = getSessionPin();
    if (existing) return existing;
    setUnlockOpen(true);
    toast("Unlock the book with your owner PIN to edit", "info");
    return null;
  }

  async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
    const pin = getSessionPin();
    const headers = ownerPinHeaders(
      pin || undefined,
      {
        ...(init?.headers as Record<string, string> | undefined),
      }
    );
    if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401 || res.status === 429) {
      setBookUnlocked(false);
      setUnlockOpen(true);
    }
    return res;
  }

    async function handleSave(values: HoldingFormValues) {
    if (!activePortfolio) return;

    if (source === "supabase") {
      if (!(await ensureBookPin())) return;
      const res = await apiFetch("/api/holdings", {
        method: "POST",
        body: JSON.stringify({
          ...values,
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

  async function handlePatch(patch: HoldingPatch) {
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
      if (!(await ensureBookPin())) return;
      const res = await apiFetch("/api/holdings", {
        method: "PATCH",
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(
          typeof data.error === "string" ? data.error : "Failed to update holding",
          "error"
        );
        return;
      }
      setHoldings((prev) =>
        prev.map((h) => (h.id === id ? { ...h, ...fields } : h))
      );
    } else {
      const next = patchHolding(loadDemoStore(), id, fields);
      setHoldings(next.holdings);
    }
  }

  const applyAdvisorActions = useCallback(
    (actions: AdvisorAction[]) => {
      if (!actions.length || !activePortfolio) return;

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
            }
            const tickers = action.holdings.map((h) => h.ticker);
            void refreshMarkets(
              tickers,
              nextHoldings.filter((h) => h.portfolio_id === activePortfolio.id)
            );
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
        if (!(await ensureBookPin())) {
          toast("Unlock required before Margus can apply changes", "error");
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
              const failed = Array.isArray(data.failed) ? data.failed.length : 0;
              const cashBit = data.cashUpdated ? " · cash updated" : "";
              toast(
                `Imported ${upserted} ticker${upserted === 1 ? "" : "s"}${cashBit}${
                  failed ? ` · ${failed} failed` : ""
                }`,
                failed ? "error" : "success"
              );
              await loadPortfolios({ silent: true });
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
    [activePortfolio, holdings, source]
  );


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
      if (!(await ensureBookPin())) return false;
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
      if (!(await ensureBookPin())) return;
      const res = await apiFetch("/api/portfolios", {
        method: "POST",
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
      if (!(await ensureBookPin())) return;
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
    const ownerPin = (pin?.trim() || getSessionPin()).trim();
    if (!ownerPin) {
      toast("Owner PIN required to delete a sheet", "error");
      return false;
    }

    if (source === "supabase") {
      const res = await apiFetch(`/api/portfolios?id=${id}`, {
        method: "DELETE",
        headers: ownerPinHeaders(ownerPin),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(
          typeof data.error === "string" ? data.error : "Failed to delete sheet",
          "error"
        );
        return false;
      }
      setSessionPin(ownerPin);
      setBookUnlocked(true);
      clearChatHistory(id);
      await loadPortfolios({ silent: true });
      setActiveId((prev) => (prev === id ? OVERVIEW_TAB_ID : prev));
    } else {
      const verify = await fetch("/api/owner/verify", {
        method: "POST",
        headers: ownerPinHeaders(ownerPin),
      });
      if (!verify.ok) {
        const data = await verify.json().catch(() => ({}));
        toast(
          typeof data.error === "string" ? data.error : "Invalid owner PIN",
          "error"
        );
        return false;
      }
      setSessionPin(ownerPin);
      setBookUnlocked(true);
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
      if (!(await ensureBookPin())) return;
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

  if (loading || portfolios.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#121214]">
        <UpsideLogo variant="icon" className="h-28 w-24" />
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  if (!isOverview && !isCompound && (!activePortfolio || !snapshot)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#121214]">
        <UpsideLogo variant="icon" className="h-28 w-24" />
        <p className="text-sm text-zinc-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_#1f1a12_0%,_#121214_52%)] text-zinc-100">
      <header className="border-b border-brand-deep/25 bg-[#121214]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <UpsideLogo
              variant="wordmark"
              className="shrink-0 text-[15px] text-white"
            />
            <span className="hidden h-5 w-px shrink-0 bg-zinc-700 sm:block" aria-hidden />
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-white sm:ml-1">
              {isOverview
                ? "Overview"
                : isCompound
                  ? "Compound"
                  : activePortfolio!.name}
            </h1>
            <span className="hidden text-zinc-700 sm:inline" aria-hidden>
              ·
            </span>
            <span
              className="hidden truncate text-xs tabular-nums text-zinc-500 sm:inline"
              title={
                source === "supabase"
                  ? "Shared live book"
                  : locked
                    ? "Local demo (saved)"
                    : "Local demo"
              }
            >
              {formatPricesAge(quotesUpdatedAt, nowTick)}
              {quotesDelayed ? " · delayed" : ""}
              {source === "supabase" && bookSyncedAt
                ? ` · book ${formatPricesAge(bookSyncedAt, nowTick).replace("Prices · ", "")}`
                : ""}
            </span>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {source === "supabase" && (
              <button
                type="button"
                onClick={() => setUnlockOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                  bookUnlocked
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
                }`}
                title={
                  bookUnlocked
                    ? "Book unlocked for edits this session"
                    : "Unlock shared book edits"
                }
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {bookUnlocked ? "Unlocked" : "Unlock"}
                </span>
              </button>
            )}
            {!isOverview && !isCompound && (
              <>
                <button
                  type="button"
                  onClick={toggleCcVisible}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
                  title={
                    ccVisible
                      ? "Hide covered-call table"
                      : "Show covered-call table"
                  }
                >
                  {ccVisible ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {ccVisible ? "Hide CC" : "Show CC"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleForecastVisible}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
                  title={
                    forecastVisible ? "Hide forecast" : "Show forecast"
                  }
                >
                  {forecastVisible ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">
                    {forecastVisible ? "Hide forecast" : "Show forecast"}
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                if (isOverview || isCompound) {
                  void refreshMarkets(allTickers, holdings, undefined, {
                    quotesOnly: true,
                  });
                } else {
                  void refreshMarkets(allTickers, portfolioHoldings);
                }
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            {source === "supabase" && (
              <button
                type="button"
                onClick={() => setSnapshotsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
                title="Nightly backups & restore"
              >
                <History className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Snapshots</span>
              </button>
            )}
            {source === "demo" && (
              <>
                <button
                  type="button"
                  onClick={saveLock}
                  className="inline-flex items-center gap-1.5 rounded-md border border-brand-deep/80 bg-brand/10 px-2.5 py-1.5 text-xs font-medium text-brand-bright hover:border-brand hover:bg-brand/20"
                  title="Lock current portfolios & holdings so seed resets cannot overwrite them"
                >
                  <Save className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">
                    {saveFlash ? "Saved" : "Save"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={resetDemo}
                  className="hidden rounded-md px-2.5 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 sm:inline"
                  title={
                    locked
                      ? "Restore last Save (does not clear your lock)"
                      : "Restore factory demo seed"
                  }
                >
                  {locked ? "Restore save" : "Reset demo"}
                </button>
              </>
            )}
            {!isOverview && !isCompound && (
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
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-5 pb-24">
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

        {isCompound ? (
          <CompoundInterestSheet bookValue={overview.totals.totalValue} />
        ) : isOverview ? (
          <>
            <OverviewDashboard
              model={overview}
              onOpenSheet={(id) => setActiveId(id)}
            />
            <CcAdvisorChat
              key={OVERVIEW_TAB_ID}
              portfolioId={OVERVIEW_TAB_ID}
              context={{
                portfolioName: "Overview",
                cashBalance: overview.totals.cash,
                adviseOnly: true,
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
        onRenameRequest={(id, name) => setRenameTarget({ id, name })}
        onDeleteRequest={(id, name) =>
          setConfirmDelete({ kind: "sheet", id, label: name })
        }
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
            ? `Delete “${confirmDelete.label}” and all of its holdings? A safety snapshot is saved first. Owner PIN required.`
            : `Remove ${confirmDelete?.label ?? "this holding"} from the sheet?`
        }
        confirmLabel="Delete"
        destructive
        requirePin={confirmDelete?.kind === "sheet"}
        pinLabel="Owner PIN"
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
          !isOverview && !isCompound ? activePortfolio?.id ?? null : null
        }
        activePortfolioName={
          !isOverview && !isCompound ? activePortfolio?.name ?? null : null
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
        onUnlocked={() => {
          setBookUnlocked(true);
          toast("Book unlocked for this tab", "success");
        }}
      />
    </div>
  );
}
