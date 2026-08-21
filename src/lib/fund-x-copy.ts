import { cashtag, currency, signedCurrency, signedPercent } from "@/lib/format";
import type { FundAction } from "@/lib/margus-fund";
import { FUND_X_HANDLE, FUND_X_URL } from "@/lib/product";

export { FUND_X_HANDLE, FUND_X_URL };
/** Free X cap. Keep the scoreboard card inside this. */
export const TWEET_MAX = 280;

export type FundStretch = {
  dollar?: number | null;
  pct?: number | null;
  spyPct?: number | null;
};

export type FundXPostInput = {
  serial: number;
  daily?: FundStretch | null;
  weekly?: FundStretch | null;
  total?: FundStretch | null;
  balance?: number | null;
  actions?: Array<Pick<FundAction, "type" | "ticker">>;
  movers?: Array<{ ticker: string; changePct: number | null | undefined }>;
  radar?: Array<{ ticker: string; waitFor?: string | null }>;
};

const TRADE_VERB: Record<Exclude<FundAction["type"], "hold">, string> = {
  buy: "bought",
  exit: "sold",
  trim: "trimmed",
  add: "bought",
};

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

function pct2(n: number): string {
  return signedPercent(n, 2);
}

function pct1(n: number): string {
  return signedPercent(n, 1);
}

function vsSpyMark(fundPct: number | null, spyPct: number | null): string {
  if (!finite(fundPct)) return "🔴";
  if (!finite(spyPct)) return fundPct >= 0 ? "🟢" : "🔴";
  return fundPct >= spyPct ? "🟢" : "🔴";
}

function moneyPct(dollar: number | null, change: number | null): string | null {
  const d = finite(dollar) ? signedCurrency(dollar, 0) : null;
  const p = finite(change) ? pct2(change) : null;
  if (d && p) return `${d} (${p})`;
  return d ?? p;
}

function stretchLine(
  label: string,
  stretch: FundStretch | null | undefined
): string | null {
  if (!stretch) return null;
  const move = moneyPct(stretch.dollar ?? null, stretch.pct ?? null);
  if (!move) return null;
  const spy = finite(stretch.spyPct) ? ` · SPY ${pct2(stretch.spyPct)}` : "";
  return `${vsSpyMark(stretch.pct ?? null, stretch.spyPct ?? null)} ${label} ${move}${spy}`;
}

/** Plain ticker for the opener: msft, not $MSFT. */
function plainTicker(ticker: string): string {
  return ticker.trim().toLowerCase();
}

/**
 * Day 5: held
 * Day 6: bought msft
 * Day 7: sold msft, bought nvda
 */
function actionHeadline(
  period: "DAY" | "WEEK",
  serial: number,
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string {
  const label = period === "DAY" ? "Day" : "Week";
  const trades = actions.filter((a) => a.type !== "hold" && a.ticker.trim());
  if (trades.length === 0) return `${label} ${serial}: held`;

  // Group consecutive same verbs: "bought nvda, msft" / "sold msft, bought nvda"
  const parts: string[] = [];
  let lastVerb: string | null = null;
  let tickers: string[] = [];
  const flush = () => {
    if (!lastVerb || tickers.length === 0) return;
    parts.push(`${lastVerb} ${tickers.join(", ")}`);
    tickers = [];
  };
  for (const a of trades) {
    if (a.type === "hold") continue;
    const t = plainTicker(a.ticker);
    if (!t) continue;
    const verb = TRADE_VERB[a.type];
    if (verb !== lastVerb) {
      flush();
      lastVerb = verb;
    }
    if (!tickers.includes(t)) tickers.push(t);
  }
  flush();
  if (parts.length === 0) return `${label} ${serial}: held`;
  return `${label} ${serial}: ${parts.join(", ")}`;
}

function moverBit(
  movers: Array<{ ticker: string; changePct: number | null | undefined }>
): string | null {
  const ranked = movers
    .filter((m) => m.ticker.trim() && finite(m.changePct))
    .sort((a, b) => Math.abs(b.changePct!) - Math.abs(a.changePct!))
    .slice(0, 2);
  if (ranked.length === 0) return null;
  return ranked
    .map((m) => {
      const n = m.changePct!;
      return `${cashtag(m.ticker)} ${pct1(n)} ${n >= 0 ? "🟢" : "🔴"}`;
    })
    .join(" ");
}

function thesisLine(
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string | null {
  const exits = [
    ...new Set(
      actions
        .filter((a) => a.type === "exit" && a.ticker.trim())
        .map((a) => cashtag(a.ticker))
        .filter((tag) => tag !== "—")
    ),
  ];
  if (exits.length === 0) return null;
  return `Thesis broken on ${exits.join(" · ")}`;
}

function radarLine(
  radar: Array<{ ticker: string; waitFor?: string | null }>
): string | null {
  const parts: string[] = [];
  for (const item of radar) {
    const tag = cashtag(item.ticker);
    if (tag === "—") continue;
    if (!parts.includes(tag)) parts.push(tag);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function composeFundXPost(
  period: "DAY" | "WEEK",
  input: FundXPostInput
): string {
  const actions = input.actions ?? [];
  const lines: string[] = [actionHeadline(period, input.serial, actions)];

  const daily = stretchLine("Day", input.daily);
  const weekly = stretchLine("Wk", input.weekly);
  const total = stretchLine("Tot", input.total);
  if (daily) lines.push(daily);
  if (weekly) lines.push(weekly);
  if (total) lines.push(total);

  if (finite(input.balance)) {
    lines.push(`💼 ${currency(input.balance, 0)}`);
  }

  const movers = moverBit(input.movers ?? []);
  if (movers) lines.push(movers);

  const thesis = thesisLine(actions);
  if (thesis) lines.push(thesis);

  const radar = radarLine(input.radar ?? []);
  if (radar) lines.push(`👀 ${radar}`);

  const text = lines.join("\n");
  if (text.length <= TWEET_MAX) return text;

  const withoutRadar = lines.filter((l) => !l.startsWith("👀 ")).join("\n");
  if (withoutRadar.length <= TWEET_MAX) return withoutRadar;

  const withoutMovers = lines
    .filter((l) => !l.startsWith("👀 ") && !/^\$[A-Z]/.test(l))
    .join("\n");
  return withoutMovers.length <= TWEET_MAX
    ? withoutMovers
    : withoutMovers.slice(0, TWEET_MAX);
}

export function composeDailyFundPost(input: FundXPostInput): string {
  return composeFundXPost("DAY", input);
}

export function composeWeeklyFundPost(input: FundXPostInput): string {
  return composeFundXPost("WEEK", input);
}
