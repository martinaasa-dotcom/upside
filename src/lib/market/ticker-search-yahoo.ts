import { isPlausibleTicker, normalizeYahooTicker } from "@/lib/ticker";
import type { TickerSuggestion } from "@/lib/market/ticker-search";

const WATCH_SYMBOL = /^[A-Z0-9.=^-]{1,12}$/;
const SKIP_TYPES = new Set([
  "OPTION",
  "FUTURE",
  "CURRENCY",
  "CRYPTOCURRENCY",
  "MONEY_MARKET",
]);

type YahooFinanceInstance = InstanceType<
  typeof import("yahoo-finance2").default
>;

let yahoo: YahooFinanceInstance | null = null;

async function getYahoo(): Promise<YahooFinanceInstance> {
  if (yahoo) return yahoo;
  const { default: YahooFinance } = await import("yahoo-finance2");
  yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
  return yahoo;
}

function companyName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name) return null;
  return name.slice(0, 48);
}

export async function searchYahooTickers(
  query: string
): Promise<TickerSuggestion[]> {
  const q = query.trim();
  if (q.length < 1 || q.length > 24) return [];
  try {
    const yf = await getYahoo();
    const result = await yf.search(q, {
      quotesCount: 8,
      newsCount: 0,
      enableFuzzyQuery: true,
    });
    const out: TickerSuggestion[] = [];
    const seen = new Set<string>();
    for (const row of result.quotes ?? []) {
      if (!("isYahooFinance" in row) || row.isYahooFinance !== true) continue;
      if (!("symbol" in row) || typeof row.symbol !== "string") continue;
      const quoteType =
        "quoteType" in row && typeof row.quoteType === "string"
          ? row.quoteType
          : "";
      if (SKIP_TYPES.has(quoteType)) continue;
      const symbol = normalizeYahooTicker(row.symbol);
      if (!symbol || !isPlausibleTicker(symbol) || !WATCH_SYMBOL.test(symbol)) {
        continue;
      }
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      const name =
        companyName("shortname" in row ? row.shortname : undefined) ??
        companyName("longname" in row ? row.longname : undefined);
      out.push({ symbol, name });
      if (out.length >= 8) break;
    }
    return out;
  } catch (err) {
    console.error("[ticker-search] Yahoo search failed", err);
    return [];
  }
}
