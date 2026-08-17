/**
 * Last-known live quotes. Memory first (same isolate), then Supabase so a
 * cold function can still fail over when Yahoo/Twelve/Finnhub are down.
 */
import type { Quote } from "@/lib/types";
import type { FxRates } from "@/lib/market/yahoo";
import type { Json } from "@/lib/supabase/database.types";
import { getSupabaseServer } from "@/lib/supabase/server";
import { sanitizeQuote } from "@/lib/market/quote-sanitize";

const MAX_MEM = 400;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FX_KEY = "__FX__";

type StoredQuote = { quote: Quote; quotedAt: number };
type StoredFx = { kind: "fx"; rates: FxRates };

const mem = new Map<string, StoredQuote>();
let memFx: { rates: FxRates; quotedAt: number } | null = null;

function pruneMem() {
  if (mem.size <= MAX_MEM) return;
  const extra = mem.size - MAX_MEM;
  const keys = [...mem.keys()].slice(0, extra);
  for (const key of keys) mem.delete(key);
}

function withinAge(quotedAt: number, now = Date.now()): boolean {
  return now - quotedAt >= 0 && now - quotedAt <= MAX_AGE_MS;
}

function asStale(quote: Quote, quotedAt: number): Quote {
  return { ...quote, stale: true, quotedAt };
}

function fromRow(ticker: string, raw: unknown, quotedAtIso: string): StoredQuote | null {
  if (!raw || typeof raw !== "object") return null;
  const quotedAt = Date.parse(quotedAtIso);
  if (!Number.isFinite(quotedAt) || !withinAge(quotedAt)) return null;
  const rec = raw as Quote;
  if (typeof rec.price !== "number" || !Number.isFinite(rec.price)) return null;
  const quote: Quote = {
    ticker: typeof rec.ticker === "string" ? rec.ticker : ticker,
    price: rec.price,
    change: typeof rec.change === "number" ? rec.change : 0,
    changePercent: typeof rec.changePercent === "number" ? rec.changePercent : 0,
    previousClose:
      typeof rec.previousClose === "number" ? rec.previousClose : rec.price,
    sparkline: Array.isArray(rec.sparkline)
      ? rec.sparkline.filter((n): n is number => typeof n === "number")
      : [],
    marketState: typeof rec.marketState === "string" ? rec.marketState : null,
    preMarketPrice: rec.preMarketPrice ?? null,
    preMarketChange: rec.preMarketChange ?? null,
    preMarketChangePercent: rec.preMarketChangePercent ?? null,
    postMarketPrice: rec.postMarketPrice ?? null,
    postMarketChange: rec.postMarketChange ?? null,
    postMarketChangePercent: rec.postMarketChangePercent ?? null,
    dailyCloses: rec.dailyCloses,
    currency: rec.currency,
    nativePrice: rec.nativePrice,
    quotedAt,
    stale: true,
  };
  const clean = sanitizeQuote(quote);
  if (!clean) return null;
  return { quote: clean, quotedAt };
}

export function rememberQuotesInMemory(
  quotes: Record<string, Quote>,
  quotedAt = Date.now()
) {
  for (const [ticker, quote] of Object.entries(quotes)) {
    if (!quote || quote.stale) continue;
    const key = ticker.toUpperCase();
    const stored: Quote = { ...quote, ticker: key, stale: false, quotedAt };
    mem.set(key, { quote: stored, quotedAt });
  }
  pruneMem();
}

export function recallQuotesFromMemory(
  tickers: string[]
): Record<string, Quote> {
  const now = Date.now();
  const out: Record<string, Quote> = {};
  for (const raw of tickers) {
    const key = raw.toUpperCase();
    const hit = mem.get(key);
    if (!hit || !withinAge(hit.quotedAt, now)) continue;
    out[key] = asStale(hit.quote, hit.quotedAt);
  }
  return out;
}

async function persistQuotes(quotes: Record<string, Quote>, quotedAt: number) {
  const db = getSupabaseServer();
  if (!db) return;
  const rows = Object.entries(quotes)
    .filter(([, q]) => q && !q.stale && q.price > 0)
    .map(([ticker, quote]) => ({
      ticker: ticker.toUpperCase(),
      quote: {
        ...quote,
        ticker: ticker.toUpperCase(),
        stale: false,
        quotedAt,
      } as unknown as Json,
      quoted_at: new Date(quotedAt).toISOString(),
    }));
  if (rows.length === 0) return;
  const { error } = await db.from("portfell_quote_cache").upsert(rows, {
    onConflict: "ticker",
  });
  if (error) console.error("quote cache persist failed", error.message);
}

async function loadQuotesFromSupabase(
  tickers: string[]
): Promise<Record<string, Quote>> {
  const db = getSupabaseServer();
  if (!db || tickers.length === 0) return {};
  const { data, error } = await db
    .from("portfell_quote_cache")
    .select("ticker, quote, quoted_at")
    .in("ticker", tickers);
  if (error || !data) {
    if (error) console.error("quote cache recall failed", error.message);
    return {};
  }
  const out: Record<string, Quote> = {};
  for (const row of data) {
    const parsed = fromRow(row.ticker, row.quote, row.quoted_at);
    if (!parsed) continue;
    mem.set(row.ticker.toUpperCase(), parsed);
    out[row.ticker.toUpperCase()] = asStale(parsed.quote, parsed.quotedAt);
  }
  pruneMem();
  return out;
}

/** Write-through after a live fetch. Memory is sync; Supabase is best-effort. */
export function rememberQuotes(
  quotes: Record<string, Quote>,
  quotedAt = Date.now()
) {
  rememberQuotesInMemory(quotes, quotedAt);
  void persistQuotes(quotes, quotedAt);
}

export async function recallQuotes(
  tickers: string[]
): Promise<Record<string, Quote>> {
  const unique = [...new Set(tickers.map((t) => t.trim().toUpperCase()).filter(Boolean))];
  if (unique.length === 0) return {};
  const fromMem = recallQuotesFromMemory(unique);
  const missing = unique.filter((t) => !fromMem[t]);
  if (missing.length === 0) return fromMem;
  const fromDb = await loadQuotesFromSupabase(missing);
  return { ...fromDb, ...fromMem };
}

export function rememberFx(rates: FxRates, quotedAt = Date.now()) {
  if (rates.eurUsd == null && rates.gbpUsd == null && Object.keys(rates.usdPer).length === 0) {
    return;
  }
  memFx = { rates, quotedAt };
  const db = getSupabaseServer();
  if (!db) return;
  void db
    .from("portfell_quote_cache")
    .upsert(
      {
        ticker: FX_KEY,
        quote: { kind: "fx", rates } as unknown as Json,
        quoted_at: new Date(quotedAt).toISOString(),
      },
      { onConflict: "ticker" }
    )
    .then(({ error }) => {
      if (error) console.error("fx cache persist failed", error.message);
    });
}

export async function recallFx(): Promise<{ rates: FxRates; quotedAt: number } | null> {
  if (memFx && withinAge(memFx.quotedAt)) return memFx;
  const db = getSupabaseServer();
  if (!db) return memFx;
  const { data, error } = await db
    .from("portfell_quote_cache")
    .select("quote, quoted_at")
    .eq("ticker", FX_KEY)
    .maybeSingle();
  if (error || !data) return memFx;
  const quotedAt = Date.parse(data.quoted_at);
  if (!Number.isFinite(quotedAt) || !withinAge(quotedAt)) return memFx;
  const raw = data.quote as StoredFx | null;
  if (!raw || raw.kind !== "fx" || !raw.rates) return memFx;
  memFx = { rates: raw.rates, quotedAt };
  return memFx;
}

export function resetQuoteStoreForTests() {
  mem.clear();
  memFx = null;
}
