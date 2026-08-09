"use client";

import { CcAdvisorChat, type AdvisorAction } from "@/components/CcAdvisorChat";
import { CoveredCallPanel } from "@/components/CoveredCallPanel";
import { HoldingModal, type HoldingFormValues } from "@/components/HoldingModal";
import { OverviewDashboard } from "@/components/OverviewDashboard";
import {
  PortfolioTable,
  type HoldingPatch,
} from "@/components/PortfolioTable";
import { PortfolioTabs } from "@/components/PortfolioTabs";
import { buildSnapshot } from "@/lib/calculations";
import { clearChatHistory } from "@/lib/chat-history";
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
  saveDemoStore,
  updateCash,
  upsertHolding,
} from "@/lib/demo-store";
import { OVERVIEW_TAB_ID, buildOverview } from "@/lib/overview";
import type {
  Holding,
  OptionCandidate,
  Portfolio,
  Quote,
} from "@/lib/types";
import { Eye, EyeOff, Plus, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type DataSource = "demo" | "supabase";

const CC_VISIBLE_KEY = "portfell-cc-visible-by-portfolio";

export function Dashboard() {
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
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [ccVisibleByPortfolio, setCcVisibleByPortfolio] = useState<
    Record<string, boolean>
  >({});

  const isOverview = activeId === OVERVIEW_TAB_ID;
  const activePortfolio = isOverview
    ? null
    : (portfolios.find((p) => p.id === activeId) ?? portfolios[0] ?? null);

  const ccVisible = activePortfolio
    ? ccVisibleByPortfolio[activePortfolio.id] !== false
    : true;

  const allTickers = useMemo(() => {
    const set = new Set(holdings.map((h) => h.ticker));
    return [...set];
  }, [holdings]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CC_VISIBLE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      if (parsed && typeof parsed === "object") setCcVisibleByPortfolio(parsed);
    } catch {
      /* ignore */
    }
  }, []);

  function toggleCcVisible() {
    if (!activePortfolio) return;
    setCcVisibleByPortfolio((prev) => {
      const nextVisible = prev[activePortfolio.id] === false;
      const next = { ...prev, [activePortfolio.id]: nextVisible };
      try {
        localStorage.setItem(CC_VISIBLE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
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

  const loadPortfolios = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/portfolios");
      const data = await res.json();
      if (data.source === "supabase" && data.portfolios?.length) {
        setSource("supabase");
        setPortfolios(data.portfolios);
        setHoldings(data.holdings ?? []);
        setActiveId((prev) => prev || OVERVIEW_TAB_ID);
      } else {
        const demo = loadDemoStore();
        setSource("demo");
        setPortfolios(demo.portfolios);
        setHoldings(demo.holdings);
        setActiveId((prev) => prev || OVERVIEW_TAB_ID);
        setLocked(hasLockedSave());
      }
    } catch {
      const demo = loadDemoStore();
      setSource("demo");
      setPortfolios(demo.portfolios);
      setHoldings(demo.holdings);
      setActiveId((prev) => prev || OVERVIEW_TAB_ID);
      setLocked(hasLockedSave());
    } finally {
      setLoading(false);
    }
  }, []);

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
          const quotesJson = await quotesRes.json();
          nextQuotes = (quotesJson.quotes ?? {}) as Record<string, Quote>;
          setQuotes(nextQuotes);
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
      } finally {
        if (!opts?.silent) setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadPortfolios();
  }, [loadPortfolios]);

  const ccSignature = portfolioHoldings
    .map(
      (h) =>
        `${h.id}:${h.ticker}:${h.shares}:${h.target_call_pct}:${h.stock_target_override ?? ""}`
    )
    .join("|");

  // Quotes for every ticker (overview + sheet views); options only on a sheet
  useEffect(() => {
    if (holdings.length === 0) return;
    if (isOverview) {
      void refreshMarkets(allTickers, holdings, undefined, {
        quotesOnly: true,
      });
      return;
    }
    if (!activePortfolio) return;
    const rows = holdings.filter((h) => h.portfolio_id === activePortfolio.id);
    void refreshMarkets(allTickers, rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePortfolio?.id, isOverview, ccSignature, allTickers.join(","), refreshMarkets]);

  // Free Yahoo poll: prices every 20s while the tab is visible (options stay on demand)
  useEffect(() => {
    if (allTickers.length === 0) return;

    const POLL_MS = 20_000;
    let cancelled = false;

    const tick = () => {
      if (cancelled || document.hidden) return;
      const rows = isOverview
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
    allTickers.join(","),
    holdings,
    refreshMarkets,
  ]);

  async function handleSave(values: HoldingFormValues) {
    if (!activePortfolio) return;

    if (source === "supabase") {
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          portfolio_id: activePortfolio.id,
        }),
      });
      if (!res.ok) {
        alert("Failed to save holding");
        return;
      }
      await loadPortfolios();
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
      const res = await fetch("/api/holdings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) {
        alert("Failed to update holding");
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

      // Supabase path — optimistic local updates + API
      for (const action of actions) {
        if (
          action.action === "set_call_pct" ||
          action.action === "update_holding"
        ) {
          const h = findHolding(action.ticker, holdings);
          if (!h) continue;
          const fields: Record<string, number> = {};
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
          void fetch("/api/holdings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: h.id, ...fields }),
          });
          setHoldings((prev) =>
            prev.map((x) => (x.id === h.id ? { ...x, ...fields } : x))
          );
        } else if (action.action === "set_call_pct_bulk") {
          for (const u of action.updates) {
            const h = findHolding(u.ticker, holdings);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            void fetch("/api/holdings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: h.id,
                target_call_pct: u.callPct,
              }),
            });
            setHoldings((prev) =>
              prev.map((x) =>
                x.id === h.id ? { ...x, target_call_pct: u.callPct } : x
              )
            );
          }
        } else if (action.action === "set_uniform_call_pct") {
          for (const h of holdings.filter(
            (x) => x.portfolio_id === activePortfolio.id
          )) {
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            void fetch("/api/holdings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: h.id,
                target_call_pct: action.callPct,
              }),
            });
          }
          setHoldings((prev) =>
            prev.map((h) =>
              h.portfolio_id === activePortfolio.id
                ? { ...h, target_call_pct: action.callPct }
                : h
            )
          );
        } else if (action.action === "set_cash") {
          void fetch("/api/portfolios", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: activePortfolio.id,
              cash_balance: action.cash,
            }),
          });
          setPortfolios((prev) =>
            prev.map((p) =>
              p.id === activePortfolio.id
                ? { ...p, cash_balance: action.cash }
                : p
            )
          );
        } else if (action.action === "add_holding") {
          void fetch("/api/holdings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              portfolio_id: activePortfolio.id,
              ticker: action.ticker,
              shares: action.shares,
              buy_price: action.buyPrice,
              target_call_pct: action.callPct,
              sort_order:
                holdings.filter((h) => h.portfolio_id === activePortfolio.id)
                  .length + 1,
            }),
          }).then(() => loadPortfolios());
        } else if (action.action === "remove_holding") {
          const h = findHolding(action.ticker, holdings);
          if (!h) continue;
          void fetch(`/api/holdings?id=${h.id}`, { method: "DELETE" });
          setHoldings((prev) => prev.filter((x) => x.id !== h.id));
        } else if (action.action === "set_stock_target") {
          const h = findHolding(action.ticker, holdings);
          if (!h) continue;
          setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          void fetch("/api/holdings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: h.id,
              stock_target_override: action.stockTarget,
            }),
          });
          setHoldings((prev) =>
            prev.map((x) =>
              x.id === h.id
                ? { ...x, stock_target_override: action.stockTarget }
                : x
            )
          );
        } else if (action.action === "set_stock_target_bulk") {
          for (const u of action.updates) {
            const h = findHolding(u.ticker, holdings);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            void fetch("/api/holdings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: h.id,
                stock_target_override: u.stockTarget,
              }),
            });
            setHoldings((prev) =>
              prev.map((x) =>
                x.id === h.id
                  ? { ...x, stock_target_override: u.stockTarget }
                  : x
              )
            );
          }
        } else if (action.action === "clear_stock_target") {
          const h = findHolding(action.ticker, holdings);
          if (!h) continue;
          setOptions((opts) => ({ ...opts, [h.ticker]: null }));
          void fetch("/api/holdings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: h.id,
              stock_target_override: null,
            }),
          });
          setHoldings((prev) =>
            prev.map((x) =>
              x.id === h.id ? { ...x, stock_target_override: null } : x
            )
          );
        } else if (action.action === "apply_write_plan") {
          for (const u of action.updates) {
            const h = findHolding(u.ticker, holdings);
            if (!h) continue;
            setOptions((opts) => ({ ...opts, [h.ticker]: null }));
            void fetch("/api/holdings", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: h.id,
                stock_target_override: u.stockTarget,
                target_call_pct: u.callPct,
              }),
            });
            setHoldings((prev) =>
              prev.map((x) =>
                x.id === h.id
                  ? {
                      ...x,
                      stock_target_override: u.stockTarget,
                      target_call_pct: u.callPct,
                    }
                  : x
              )
            );
          }
        }
      }
    },
    // refreshMarkets / loadPortfolios are stable enough via closure for advisor tools
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePortfolio, holdings, source]
  );


  async function handleDelete(id: string) {
    if (!confirm("Delete this holding?")) return;
    if (source === "supabase") {
      const res = await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Failed to delete");
        return;
      }
      await loadPortfolios();
    } else {
      const next = deleteHolding(loadDemoStore(), id);
      setHoldings(next.holdings);
    }
  }

  async function handleAddSheet(name: string) {
    if (source === "supabase") {
      const res = await fetch("/api/portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        alert("Failed to add sheet");
        return;
      }
      const data = await res.json();
      setPortfolios((prev) => [...prev, data.portfolio]);
      setActiveId(data.portfolio.id);
    } else {
      const next = addPortfolio(loadDemoStore(), name);
      setPortfolios(next.portfolios);
      const created = next.portfolios[next.portfolios.length - 1];
      setActiveId(created.id);
    }
  }

  async function handleRenameSheet(id: string, name: string) {
    if (source === "supabase") {
      const res = await fetch("/api/portfolios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name }),
      });
      if (!res.ok) {
        alert("Failed to rename");
        return;
      }
    } else {
      renamePortfolio(loadDemoStore(), id, name);
    }
    setPortfolios((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name } : p))
    );
  }

  async function handleDeleteSheet(id: string) {
    if (source === "supabase") {
      const res = await fetch(`/api/portfolios?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Failed to delete sheet");
        return;
      }
      clearChatHistory(id);
      await loadPortfolios();
      setActiveId((prev) => (prev === id ? OVERVIEW_TAB_ID : prev));
    } else {
      const next = deletePortfolio(loadDemoStore(), id);
      clearChatHistory(id);
      setPortfolios(next.portfolios);
      setHoldings(next.holdings);
      if (activeId === id) setActiveId(OVERVIEW_TAB_ID);
    }
  }

  async function handleEditCash() {
    if (!activePortfolio) return;
    const raw = prompt("Cash balance", String(activePortfolio.cash_balance));
    if (raw === null) return;
    const cash = Number(raw);
    if (Number.isNaN(cash)) return;

    if (source === "demo") {
      const next = updateCash(loadDemoStore(), activePortfolio.id, cash);
      setPortfolios(next.portfolios);
    } else {
      const res = await fetch("/api/portfolios", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activePortfolio.id, cash_balance: cash }),
      });
      if (!res.ok) {
        alert("Failed to update cash");
        return;
      }
      setPortfolios((prev) =>
        prev.map((p) =>
          p.id === activePortfolio.id ? { ...p, cash_balance: cash } : p
        )
      );
    }
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
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading Portfell…
      </div>
    );
  }

  if (!isOverview && (!activePortfolio || !snapshot)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading Portfell…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(ellipse_at_top,_#1a2332_0%,_#09090b_55%)] text-zinc-100">
      <header className="border-b border-zinc-800/80 bg-zinc-950/50">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400/90">
              Portfolio
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {isOverview ? "Overview" : activePortfolio!.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                source === "supabase"
                  ? "bg-sky-500/15 text-sky-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {source === "supabase" ? "Supabase" : "Local demo"}
            </span>
            {!isOverview && (
              <button
                type="button"
                onClick={toggleCcVisible}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
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
                {ccVisible ? "Hide CC" : "Show CC"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (isOverview) {
                  void refreshMarkets(allTickers, holdings, undefined, {
                    quotesOnly: true,
                  });
                } else {
                  void refreshMarkets(allTickers, portfolioHoldings);
                }
              }}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            {source === "demo" && (
              <>
                <button
                  type="button"
                  onClick={saveLock}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/80 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 hover:border-emerald-500 hover:bg-emerald-500/20 hover:text-emerald-200"
                  title="Lock current portfolios & holdings so seed resets cannot overwrite them"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveFlash ? "Saved" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={resetDemo}
                  className="hidden rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 sm:inline"
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
            {!isOverview && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
              >
                <Plus className="h-4 w-4" />
                Add holding
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-5 pb-24">
        {isOverview ? (
          <OverviewDashboard
            model={overview}
            onOpenSheet={(id) => setActiveId(id)}
          />
        ) : (
          <>
            <PortfolioTable
              portfolio={activePortfolio!}
              holdings={snapshot!.holdings}
              totals={snapshot!.totals}
              onPatch={handlePatch}
              onDelete={handleDelete}
              onEditCash={handleEditCash}
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
              />
            )}

            <CcAdvisorChat
              key={activePortfolio!.id}
              portfolioId={activePortfolio!.id}
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
        activeId={isOverview ? OVERVIEW_TAB_ID : activePortfolio!.id}
        onChange={setActiveId}
        onAdd={handleAddSheet}
        onRename={handleRenameSheet}
        onDelete={handleDeleteSheet}
      />

      <HoldingModal
        open={modalOpen}
        portfolioName={activePortfolio?.name ?? ""}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />
    </div>
  );
}
