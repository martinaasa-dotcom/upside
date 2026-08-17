"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Input } from "@/components/ui/input";
import { SUGGEST_MENU } from "@/components/ui/Panel";
import { TickerSymbol } from "@/components/TickerSymbol";
import { ViewportOverlay } from "@/components/ui/ViewportOverlay";
import { ownedBookPortfolios } from "@/lib/classroom";
import {
  EXPERIENCE_TIERS,
  saveStoredKnowsOptions,
  saveStoredTier,
  type ExperienceTier,
} from "@/lib/experience-tier";
import { requestBookRefresh } from "@/lib/book-cache";
import { cn } from "@/lib/format";
import {
  isSafePositiveMoney,
  isSafeShares,
  sanitizeTickerQuery,
} from "@/lib/input-guard";
import {
  listingAmountToUsd,
  listingCurrency,
  listingPriceDigits,
  usdPerMapFromFx,
} from "@/lib/listing-currency";
import {
  localTickerSuggestions,
  looksLikeTickerQuery,
  mergeAndRankTickerSuggestions,
  pickTickerSuggestion,
} from "@/lib/market/ticker-search";
import { roundMoney, roundShares } from "@/lib/money";
import { blockWheelChange, parseDecimal } from "@/lib/number-input";
import { postJsonOrQueue } from "@/lib/offline/queued-fetch";
import { FALLBACK_POPULAR_TICKERS } from "@/lib/popular-tickers";
import { FIRST_SHEET_NAME } from "@/lib/product";
import {
  isPlausibleTicker,
  normalizeYahooTicker,
} from "@/lib/ticker";
import { useTickerSearch } from "@/lib/use-ticker-search";
import {
  addWatchlistTicker,
  loadWatchlist,
  removeWatchlistTicker,
  saveWatchlist,
} from "@/lib/watchlist";
import { Check, GraduationCap, Sparkles, TrendingUp, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  onDone: (tier: ExperienceTier, knowsOptions: boolean) => void;
};

type Q1Answer = "new" | "comfortable" | "active";
type Q2Answer = "never" | "know" | "regularly";
type Stage = "app" | "stocks" | "watchlist" | "email" | "welcome";
type AppPage = "intro" | "q1" | "q2";

const STAGES: { id: Stage; label: string }[] = [
  { id: "app", label: "App" },
  { id: "stocks", label: "Stocks" },
  { id: "watchlist", label: "Watchlist" },
  { id: "email", label: "Email" },
  { id: "welcome", label: "Welcome" },
];

const Q1_OPTIONS: { id: Q1Answer; label: string; icon: typeof GraduationCap }[] =
  [
    {
      id: "new",
      label: "New to this, still learning the basics",
      icon: GraduationCap,
    },
    {
      id: "comfortable",
      label: "Comfortable, I understand stocks and portfolios",
      icon: TrendingUp,
    },
    {
      id: "active",
      label: "Very experienced, I trade actively or watch markets closely",
      icon: Sparkles,
    },
  ];

const Q2_OPTIONS: { id: Q2Answer; label: string }[] = [
  { id: "never", label: "No, not familiar with them" },
  { id: "know", label: "I understand them but rarely use them" },
  { id: "regularly", label: "Yes, regularly" },
];

const Q1_TIER: Record<Q1Answer, ExperienceTier> = {
  new: "novice",
  comfortable: "investor",
  active: "advanced",
};
const Q2_TIER: Record<Q2Answer, ExperienceTier> = {
  never: "novice",
  know: "investor",
  regularly: "advanced",
};
const TIER_RANK: Record<ExperienceTier, number> = {
  novice: 0,
  investor: 1,
  advanced: 2,
};

const POPULAR_PICKS = FALLBACK_POPULAR_TICKERS.slice(0, 12);

type AddedHolding = { ticker: string; shares: number; buyPrice: number };

function blendTier(q1: Q1Answer, q2: Q2Answer): ExperienceTier {
  return TIER_RANK[Q2_TIER[q2]] > TIER_RANK[Q1_TIER[q1]]
    ? Q2_TIER[q2]
    : Q1_TIER[q1];
}

function Progress({ stage }: { stage: Stage }) {
  const active = STAGES.findIndex((s) => s.id === stage);
  return (
    <div className="mb-5 shrink-0">
      <div className="flex gap-1.5">
        {STAGES.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "h-1 min-w-0 flex-1 rounded-full",
              i <= active ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        {STAGES.map((s, i) => (
          <p
            key={s.id}
            className={cn(
              "min-w-0 flex-1 truncate text-sm",
              i === active
                ? "font-medium text-foreground"
                : "text-muted-foreground"
            )}
          >
            {s.label}
          </p>
        ))}
      </div>
    </div>
  );
}

export function ExperienceOnboardingModal({ onDone }: Props) {
  const [stage, setStage] = useState<Stage>("app");
  const [appPage, setAppPage] = useState<AppPage>("intro");
  const [q1, setQ1] = useState<Q1Answer | null>(null);
  const [q2, setQ2] = useState<Q2Answer | null>(null);
  const [noteMorning, setNoteMorning] = useState(false);
  const [noteSunday, setNoteSunday] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExperienceTier | null>(null);
  const [resultKnowsOptions, setResultKnowsOptions] = useState(true);

  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);
  const [stockBusy, setStockBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [added, setAdded] = useState<AddedHolding[]>([]);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const tickerRef = useRef<HTMLInputElement>(null);
  const remote = useTickerSearch(stage === "stocks" ? ticker : "");
  const suggestions = useMemo(
    () =>
      mergeAndRankTickerSuggestions(
        ticker,
        localTickerSuggestions(ticker, [], new Set()),
        remote,
        new Set()
      ),
    [ticker, remote]
  );

  const [watching, setWatching] = useState<string[]>([]);
  const [watchDraft, setWatchDraft] = useState("");
  const [popular, setPopular] = useState<string[]>([...POPULAR_PICKS]);

  useEffect(() => {
    setWatching(loadWatchlist());
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/popular-tickers", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tickers?: string[] } | null) => {
        if (ctrl.signal.aborted) return;
        if (data?.tickers?.length) setPopular(data.tickers.slice(0, 12));
      })
      .catch(() => {
        /* keep the fallback twelve */
      });
    return () => ctrl.abort();
  }, []);

  async function saveAnswers() {
    if (!q1 || !q2) return;
    setSaving(true);
    const tier = blendTier(q1, q2);
    const knowsOptions = q2 === "regularly";
    saveStoredTier(tier);
    saveStoredKnowsOptions(knowsOptions);
    try {
      await postJsonOrQueue("/api/account/experience-tier", {
        tier,
        knowsOptions,
      });
      await postJsonOrQueue("/api/account/morning-note", {
        morning: noteMorning,
        sunday: noteSunday,
      });
    } catch {
      /* localStorage already has the tier; notes can be set in Account */
    }
    setSaving(false);
    setResult(tier);
    setResultKnowsOptions(knowsOptions);
    setStage("welcome");
  }

  async function ensureSheet(): Promise<string | null> {
    if (sheetId) return sheetId;
    const res = await fetch("/api/portfolios", { cache: "no-store" });
    const data = res.ok ? await res.json() : null;
    const own = ownedBookPortfolios(
      (data?.portfolios ?? []) as { id: string; classroom_community_id?: string | null }[]
    );
    if (own[0]?.id) {
      setSheetId(own[0].id);
      return own[0].id;
    }
    const created = await fetch("/api/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FIRST_SHEET_NAME }),
    });
    if (!created.ok) return null;
    const createdData = (await created.json()) as {
      portfolio?: { id?: string };
    };
    const id = createdData.portfolio?.id ?? null;
    if (id) setSheetId(id);
    return id;
  }

  async function resolveTicker(raw: string): Promise<string> {
    const picked = pickTickerSuggestion(raw, suggestions);
    if (picked?.symbol) return normalizeYahooTicker(picked.symbol);
    if (looksLikeTickerQuery(raw)) return normalizeYahooTicker(raw);
    try {
      const res = await fetch(
        `/api/market/search?q=${encodeURIComponent(raw)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return "";
      const data = (await res.json()) as {
        results?: { symbol: string; name: string | null }[];
      };
      const hit = pickTickerSuggestion(raw, data.results ?? []);
      return hit?.symbol ? normalizeYahooTicker(hit.symbol) : "";
    } catch {
      return "";
    }
  }

  async function addHolding() {
    if (stockBusy) return;
    setStockBusy(true);
    setStockError(null);
    try {
      const sharesN = parseDecimal(shares);
      const buyN = parseDecimal(buyPrice);
      const normalizedTicker = await resolveTicker(ticker.trim());
      if (!normalizedTicker) {
        setStockError("Type a ticker or a company name.");
        return;
      }
      if (!isPlausibleTicker(normalizedTicker)) {
        setStockError("That ticker doesn't look like a real symbol.");
        return;
      }
      if (!isSafeShares(sharesN)) {
        setStockError("Share count has to be bigger than 0 and not enormous.");
        return;
      }
      if (!isSafePositiveMoney(buyN)) {
        setStockError("Buy price has to be bigger than 0 and not enormous.");
        return;
      }

      let buyUsd = roundMoney(buyN);
      const buyCode = listingCurrency(normalizedTicker);
      if (buyCode !== "USD") {
        const fxRes = await fetch(
          `/api/quotes?tickers=${encodeURIComponent(normalizedTicker)}`,
          { cache: "no-store" }
        );
        if (!fxRes.ok) {
          setStockError("Couldn't convert that buy price. Try again in a second.");
          return;
        }
        const fxJson = (await fxRes.json()) as {
          fx?: {
            eurUsd?: number | null;
            gbpUsd?: number | null;
            usdPer?: Record<string, number | null | undefined>;
          };
        };
        const rates = usdPerMapFromFx(fxJson.fx);
        if (!(rates[buyCode] > 0)) {
          setStockError("Couldn't convert that buy price. Try again in a second.");
          return;
        }
        buyUsd = listingAmountToUsd(buyN, buyCode, rates);
      }

      const id = await ensureSheet();
      if (!id) {
        setStockError("Couldn't open a portfolio. Try again.");
        return;
      }
      const res = await fetch("/api/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          portfolio_id: id,
          ticker: normalizedTicker,
          shares: roundShares(sharesN),
          buy_price: buyUsd,
        }),
      });
      if (!res.ok) {
        setStockError("Couldn't save that holding. Try again.");
        return;
      }
      setAdded((prev) => [
        ...prev.filter((r) => r.ticker !== normalizedTicker),
        {
          ticker: normalizedTicker,
          shares: roundShares(sharesN),
          buyPrice: roundMoney(buyN, listingPriceDigits(buyCode)),
        },
      ]);
      setTicker("");
      setShares("");
      setBuyPrice("");
      setListOpen(false);
      requestBookRefresh();
      requestAnimationFrame(() => tickerRef.current?.focus());
    } catch {
      setStockError("Couldn't save that holding. Try again.");
    } finally {
      setStockBusy(false);
    }
  }

  function toggleWatch(symbol: string) {
    const t = symbol.trim().toUpperCase();
    if (!t) return;
    setWatching((prev) => {
      const next = prev.includes(t)
        ? removeWatchlistTicker(prev, t)
        : addWatchlistTicker(prev, t);
      return next;
    });
  }

  async function addWatchDraft() {
    const raw = watchDraft.trim();
    if (!raw) return;
    let t = looksLikeTickerQuery(raw) ? normalizeYahooTicker(raw) : "";
    if (!t) {
      try {
        const res = await fetch(
          `/api/market/search?q=${encodeURIComponent(raw)}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as {
          results?: { symbol: string; name: string | null }[];
        };
        t = pickTickerSuggestion(raw, data.results ?? [])?.symbol ?? "";
        if (t) t = normalizeYahooTicker(t);
      } catch {
        t = "";
      }
    }
    if (!/^[A-Z0-9.=^-]{1,12}$/.test(t)) return;
    setWatching((prev) => addWatchlistTicker(prev, t));
    setWatchDraft("");
  }

  const resultLabel = result
    ? EXPERIENCE_TIERS.find((t) => t.id === result)?.label
    : null;
  const buyCode = ticker.trim()
    ? listingCurrency(
        looksLikeTickerQuery(ticker)
          ? normalizeYahooTicker(ticker)
          : ticker.trim().toUpperCase()
      )
    : "USD";

  return (
    <ViewportOverlay className="z-[200] flex items-center justify-center bg-black/10 p-4">
      <div className="flex max-h-[min(100%,42rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:max-w-lg">
        <Progress stage={stage} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          {stage === "app" && appPage === "intro" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  This is Upside Lab
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Home is your book: the names you own, and what they did.
                  Pulse is a plain read when a name jumps, so you can see if
                  the reason you own it still holds. Margus can talk the book
                  through with you. A circle is optional, people you choose to
                  share with.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Next you add what you own, then names you only watch, then
                  whether you want a note in your inbox. Two questions first so
                  the screens stay simple.
                </p>
              </div>
              <Button type="button" className="w-full" onClick={() => setAppPage("q1")}>
                Continue
              </Button>
            </div>
          )}

          {stage === "app" && appPage === "q1" && (
            <div className="flex flex-col gap-2">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-foreground">
                  How would you describe yourself as an investor?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This just simplifies what you see. Nothing is locked, and you
                  can change it anytime in Account.
                </p>
              </div>
              {Q1_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <Button
                    key={opt.id}
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start py-3"
                    onClick={() => {
                      setQ1(opt.id);
                      setAppPage("q2");
                    }}
                  >
                    <Icon data-icon="inline-start" />
                    {opt.label}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                className="mt-1 w-full"
                onClick={() => setAppPage("intro")}
              >
                Back
              </Button>
            </div>
          )}

          {stage === "app" && appPage === "q2" && (
            <div className="flex flex-col gap-2">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Have you used covered calls or other options strategies?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This just simplifies what you see. Nothing is locked, and you
                  can change it anytime in Account.
                </p>
              </div>
              {Q2_OPTIONS.map((opt) => (
                <Button
                  key={opt.id}
                  type="button"
                  variant="outline"
                  className="h-auto w-full justify-start py-3"
                  onClick={() => {
                    setQ2(opt.id);
                    setStage("stocks");
                  }}
                >
                  {opt.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                className="mt-1 w-full"
                onClick={() => setAppPage("q1")}
              >
                Back
              </Button>
            </div>
          )}

          {stage === "stocks" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Add what you own
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ticker, how many shares, and what you paid. Skip if you
                  don&apos;t have names yet. You can add more from Home later.
                </p>
              </div>
              {added.length > 0 && (
                <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
                  {added.map((row) => (
                    <Item key={row.ticker} size="sm" className="px-0">
                      <ItemContent>
                        <ItemTitle>
                          <TickerSymbol ticker={row.ticker} />
                        </ItemTitle>
                      </ItemContent>
                      <ItemActions>
                        <span className="tabular-nums text-muted-foreground">
                          {row.shares} @ {row.buyPrice}
                        </span>
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              )}
              <Field>
                <FieldLabel htmlFor="onboard-ticker">Ticker or company</FieldLabel>
                <div className="relative">
                  <Input
                    id="onboard-ticker"
                    ref={tickerRef}
                    value={ticker}
                    onChange={(e) => {
                      setTicker(sanitizeTickerQuery(e.target.value));
                      setListOpen(true);
                      setStockError(null);
                    }}
                    onFocus={() => {
                      if (ticker.trim()) setListOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && suggestions[0] && listOpen) {
                        e.preventDefault();
                        setTicker(suggestions[0]!.symbol);
                        setListOpen(false);
                      }
                    }}
                    placeholder="Apple, NVDA, or SPY5"
                    autoComplete="off"
                  />
                  {listOpen && suggestions.length > 0 && (
                    <ul className={SUGGEST_MENU}>
                      {suggestions.map((row) => (
                        <li key={row.symbol}>
                          <button
                            type="button"
                            className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setTicker(row.symbol);
                              setListOpen(false);
                            }}
                          >
                            <TickerSymbol
                              ticker={row.symbol}
                              showCurrency={listingCurrency(row.symbol) !== "USD"}
                            />
                            {row.name && (
                              <span className="truncate text-muted-foreground">
                                {row.name}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <FieldDescription>
                  Type the ticker or the company. Average buy in this
                  listing&apos;s money
                  {buyCode !== "USD" ? ` (${buyCode})` : ""}.
                </FieldDescription>
              </Field>
              <div className="flex gap-6">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="onboard-shares">Shares</FieldLabel>
                  <Input
                    id="onboard-shares"
                    type="text"
                    inputMode="decimal"
                    value={shares}
                    onChange={(e) => {
                      setShares(
                        e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                      );
                      setStockError(null);
                    }}
                    onWheel={blockWheelChange}
                    className="tabular-nums"
                  />
                </Field>
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="onboard-buy">
                    Average buy{buyCode !== "USD" ? ` (${buyCode})` : ""}
                  </FieldLabel>
                  <Input
                    id="onboard-buy"
                    type="text"
                    inputMode="decimal"
                    value={buyPrice}
                    onChange={(e) => {
                      setBuyPrice(
                        e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, "")
                      );
                      setStockError(null);
                    }}
                    onWheel={blockWheelChange}
                    className="tabular-nums"
                  />
                </Field>
              </div>
              {stockError && (
                <p className="text-sm text-destructive">{stockError}</p>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={stockBusy}
                onClick={() => void addHolding()}
              >
                {stockBusy ? "Saving…" : added.length ? "Add another" : "Add holding"}
              </Button>
              <Button
                type="button"
                className="w-full"
                onClick={() => setStage("watchlist")}
              >
                {added.length ? "Continue" : "Skip for now"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStage("app");
                  setAppPage("q2");
                }}
              >
                Back
              </Button>
            </div>
          )}

          {stage === "watchlist" && (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Names you&apos;re watching
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Not ones you own. Pick a few so Pulse has something to look
                  at besides the book. Skip if you don&apos;t have any yet.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {popular.map((t) => {
                  const on = watching.includes(t);
                  return (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={on ? "default" : "outline"}
                      onClick={() => toggleWatch(t)}
                    >
                      {t}
                    </Button>
                  );
                })}
              </div>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void addWatchDraft();
                }}
              >
                <Input
                  value={watchDraft}
                  onChange={(e) =>
                    setWatchDraft(sanitizeTickerQuery(e.target.value))
                  }
                  placeholder="Apple or NVDA"
                  autoComplete="off"
                />
                <Button type="submit" variant="outline">
                  Add
                </Button>
              </form>
              {watching.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {watching.map((t) => (
                    <li key={t}>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleWatch(t)}
                      >
                        {t}
                        <X data-icon="inline-end" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  saveWatchlist(watching);
                  setStage("email");
                }}
              >
                {watching.length ? "Continue" : "Skip for now"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStage("stocks")}
              >
                Back
              </Button>
            </div>
          )}

          {stage === "email" && (
            <div className="flex flex-col gap-3">
              <div className="mb-1">
                <h2 className="text-lg font-semibold text-foreground">
                  Want a report in your inbox?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sunday is on. Weekdays only if you want them. These start
                  once there are names in your portfolio. Change this anytime
                  in Account.
                </p>
              </div>
              <FieldGroup>
                <Field orientation="horizontal">
                  <Checkbox
                    id="note-morning"
                    checked={noteMorning}
                    onCheckedChange={(v) => setNoteMorning(v === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="note-morning">Weekdays</FieldLabel>
                    <FieldDescription>
                      What to watch before the open, then a recap after the US
                      close.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Field orientation="horizontal">
                  <Checkbox
                    id="note-sunday"
                    checked={noteSunday}
                    onCheckedChange={(v) => setNoteSunday(v === true)}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor="note-sunday">Sundays</FieldLabel>
                    <FieldDescription>
                      The week that just finished, plus a look at the next ones.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
              <Button
                type="button"
                className="w-full"
                disabled={saving || !q1 || !q2}
                onClick={() => void saveAnswers()}
              >
                {saving ? "Saving…" : "Continue"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStage("watchlist")}
              >
                Back
              </Button>
            </div>
          )}

          {stage === "welcome" && (
            <div className="flex flex-col gap-4 text-center">
              <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-foreground">
                <Check className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  You&apos;re in
                  {resultLabel ? `. Set to ${resultLabel}` : ""}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Home is your book. Pulse is how those names are doing. Change
                  the view and the email notes anytime in Account. Whenever
                  you&apos;re ready, go take a look.
                </p>
              </div>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  saveWatchlist(watching);
                  requestBookRefresh();
                  if (result) onDone(result, resultKnowsOptions);
                }}
              >
                See your book
              </Button>
            </div>
          )}
        </div>
      </div>
    </ViewportOverlay>
  );
}
