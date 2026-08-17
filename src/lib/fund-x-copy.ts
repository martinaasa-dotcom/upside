import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import { stripReportSerialPrefix } from "@/lib/fund-copy";
import { cashtag, currency, signedCurrency, signedPercent } from "@/lib/format";
import type { FundAction } from "@/lib/margus-fund";
import { FUND_X_HANDLE, FUND_X_URL } from "@/lib/product";

export { FUND_X_HANDLE, FUND_X_URL };
export const TWEET_MAX = 280;

const TRADE_VERB: Record<Exclude<FundAction["type"], "hold">, string> = {
  buy: "Opened",
  exit: "Exited",
  trim: "Trimmed",
  add: "Added to",
};

function charCount(s: string): number {
  return [...s].length;
}

function clipHeadline(headline: string, budget: number): string {
  if (budget <= 0) return "";
  if (charCount(headline) <= budget) return headline;
  const sliced = [...headline]
    .slice(0, Math.max(0, budget - 1))
    .join("")
    .trimEnd();
  const cut = sliced.lastIndexOf(" ");
  const base = cut >= 12 ? sliced.slice(0, cut) : sliced;
  return `${base.replace(/[.,;:]+$/, "")}.`;
}

function finite(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n);
}

/** Two decimals so a +$14 day does not round to 0.0%. */
function pct(n: number): string {
  return signedPercent(n, 2);
}

/**
 * Dollar P&L, percent, ending value, and the S&P over the same stretch.
 * Missing S&P is omitted (first day has no prior close in this book).
 */
export function fundScoreboard(input: {
  changePct?: number | null;
  changeDollar?: number | null;
  portfolioValue?: number | null;
  spyChangePct?: number | null;
}): string | null {
  const value = finite(input.portfolioValue)
    ? currency(input.portfolioValue, 0)
    : null;
  const dollar = finite(input.changeDollar)
    ? signedCurrency(input.changeDollar, 0)
    : null;
  const change = finite(input.changePct) ? pct(input.changePct) : null;
  if (!value && !dollar && !change) return null;

  const move =
    dollar && change
      ? `${dollar} (${change})`
      : dollar ?? change ?? "flat";
  const to = value ? ` to ${value}` : "";
  const spy = finite(input.spyChangePct)
    ? `. S&P ${pct(input.spyChangePct)}.`
    : ".";
  return `Paper fund ${move}${to}${spy}`;
}

function tradeLine(
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string {
  const trades = actions.filter(
    (a) => a.type !== "hold" && a.ticker.trim()
  );
  if (trades.length === 0) return "No trades.";

  const grouped = new Map<string, string[]>();
  for (const a of trades) {
    if (a.type === "hold") continue;
    const tag = cashtag(a.ticker);
    if (tag === "—") continue;
    const verb = TRADE_VERB[a.type];
    const list = grouped.get(verb) ?? [];
    if (!list.includes(tag)) list.push(tag);
    grouped.set(verb, list);
  }

  const parts: string[] = [];
  for (const [verb, tags] of grouped) {
    const shown = tags.slice(0, 3);
    const extra = tags.length - shown.length;
    const names =
      extra > 0 ? `${shown.join(", ")}, and more` : joinAnd(shown);
    parts.push(`${verb} ${names}.`);
  }
  return parts.join(" ") || "No trades.";
}

function joinAnd(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function assemble(headline: string, mid: string): string {
  const wrap = (h: string) => `${h}\n\n${mid}`;
  const full = wrap(headline);
  if (charCount(full) <= TWEET_MAX) return full;
  const overhead = charCount(wrap(""));
  const budget = Math.max(24, TWEET_MAX - overhead);
  return wrap(clipHeadline(headline, budget));
}

function cleanHeadline(raw: string): string {
  return stripReportSerialPrefix(humanizeMargusText(raw))
    .replace(/[\u2010\u2011\u2212]/g, "-")
    .trim();
}

export function composeDailyFundPost(input: {
  serial: number;
  headline: string;
  dayChangePct?: number | null;
  dayChangeDollar?: number | null;
  portfolioValue?: number | null;
  spyChangePct?: number | null;
  actions: Array<Pick<FundAction, "type" | "ticker">>;
}): string {
  const title = `Day ${input.serial}: ${cleanHeadline(input.headline)}`;
  const money = fundScoreboard({
    changePct: input.dayChangePct,
    changeDollar: input.dayChangeDollar,
    portfolioValue: input.portfolioValue,
    spyChangePct: input.spyChangePct,
  });
  const trades = tradeLine(input.actions);
  const mid = [money, trades].filter(Boolean).join(" ");
  return assemble(title, mid);
}

export function composeWeeklyFundPost(input: {
  serial: number;
  headline: string;
  weekReturnPct?: number | null;
  weekChangeDollar?: number | null;
  portfolioValue?: number | null;
  spyWeekReturnPct?: number | null;
}): string {
  const title = `Week ${input.serial}: ${cleanHeadline(input.headline)}`;
  const money =
    fundScoreboard({
      changePct: input.weekReturnPct,
      changeDollar: input.weekChangeDollar,
      portfolioValue: input.portfolioValue,
      spyChangePct: input.spyWeekReturnPct,
    }) ?? "Quiet week on the paper fund.";
  return assemble(title, money);
}
