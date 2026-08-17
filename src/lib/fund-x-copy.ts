import { humanizeMargusText } from "@/lib/ai/humanize-copy";
import { stripReportSerialPrefix } from "@/lib/fund-copy";
import { cashtag, signedCurrency, signedPercent } from "@/lib/format";
import type { FundAction } from "@/lib/margus-fund";
import { FUND_X_HANDLE, FUND_X_URL } from "@/lib/product";

export { FUND_X_HANDLE, FUND_X_URL };
export const FUND_X_FOOTER = "Paper money. Not a real fund.";
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

function moneyLine(
  changePct: number | null | undefined,
  changeDollar: number | null | undefined,
  vsLabel?: string,
  vsPct?: number | null
): string | null {
  const move =
    changePct != null && Number.isFinite(changePct)
      ? signedPercent(changePct)
      : changeDollar != null && Number.isFinite(changeDollar)
        ? signedCurrency(changeDollar, 0)
        : null;
  if (!move) return null;
  const vs =
    vsLabel && vsPct != null && Number.isFinite(vsPct)
      ? ` vs ${vsLabel} ${signedPercent(vsPct)}`
      : "";
  const dollars =
    changePct != null &&
    Number.isFinite(changePct) &&
    changeDollar != null &&
    Number.isFinite(changeDollar)
      ? ` (${signedCurrency(changeDollar, 0)})`
      : "";
  return `Paper fund ${move}${dollars}${vs}.`;
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
  const footer = FUND_X_FOOTER;
  const wrap = (h: string) => `${h}\n\n${mid}\n\n${footer}`;
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
  actions: Array<Pick<FundAction, "type" | "ticker">>;
}): string {
  const title = `Day ${input.serial}: ${cleanHeadline(input.headline)}`;
  const money = moneyLine(input.dayChangePct, input.dayChangeDollar);
  const trades = tradeLine(input.actions);
  const mid = [money, trades].filter(Boolean).join(" ");
  return assemble(title, mid);
}

export function composeWeeklyFundPost(input: {
  serial: number;
  headline: string;
  weekReturnPct?: number | null;
  spyWeekReturnPct?: number | null;
}): string {
  const title = `Week ${input.serial}: ${cleanHeadline(input.headline)}`;
  const money =
    moneyLine(
      input.weekReturnPct,
      null,
      "the S&P",
      input.spyWeekReturnPct
    ) ?? "Quiet week on the paper fund.";
  return assemble(title, money);
}
