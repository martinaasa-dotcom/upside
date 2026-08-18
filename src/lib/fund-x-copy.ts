import { cashtag, currency, signedCurrency, signedPercent } from "@/lib/format";
import type { FundAction } from "@/lib/margus-fund";
import { FUND_X_HANDLE, FUND_X_URL } from "@/lib/product";

export { FUND_X_HANDLE, FUND_X_URL };
/** Long enough for the scoreboard card. Premium X, not the 280 cap. */
export const TWEET_MAX = 4000;

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
  buy: "Opened",
  exit: "Exited",
  trim: "Trimmed",
  add: "Added to",
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
  const spy = finite(stretch.spyPct) ? ` - $SPY ${pct2(stretch.spyPct)}` : "";
  return `${vsSpyMark(stretch.pct ?? null, stretch.spyPct ?? null)} ${label}: ${move}${spy}`;
}

function tradeBullet(
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string {
  const trades = actions.filter((a) => a.type !== "hold" && a.ticker.trim());
  if (trades.length === 0) return "No trades executed";

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
    parts.push(`${verb} ${tags.join(" · ")}`);
  }
  return parts.join(" · ") || "No trades executed";
}

function moverBullet(
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

function thesisBullet(
  actions: Array<Pick<FundAction, "type" | "ticker">>
): string {
  const exits = [
    ...new Set(
      actions
        .filter((a) => a.type === "exit" && a.ticker.trim())
        .map((a) => cashtag(a.ticker))
        .filter((tag) => tag !== "—")
    ),
  ];
  if (exits.length === 0) return "Thesis intact across all holdings";
  return `Thesis broken on ${exits.join(" · ")}`;
}

function shortWait(waitFor: string): string {
  const trimmed = waitFor
    .replace(/^wait(?:ing)? for\s+/i, "")
    .replace(/[\u2010\u2011\u2212\u2014]/g, "-")
    .trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/).slice(0, 3).join(" ").replace(/[.,;:]+$/, "");
}

function radarLine(
  radar: Array<{ ticker: string; waitFor?: string | null }>
): string | null {
  const parts: string[] = [];
  for (const item of radar) {
    const tag = cashtag(item.ticker);
    if (tag === "—") continue;
    const wait = shortWait(item.waitFor ?? "");
    const bit = wait ? `${tag} ${wait}` : tag;
    if (!parts.includes(bit)) parts.push(bit);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function composeFundXPost(
  period: "DAY" | "WEEK",
  input: FundXPostInput
): string {
  const lines: string[] = [
    `UPSIDE FUND - ${period} ${input.serial} UPDATE 📊`,
  ];
  const daily = stretchLine("Daily", input.daily);
  const weekly = stretchLine("Weekly", input.weekly);
  const total = stretchLine("Total", input.total);
  if (daily) lines.push(daily);
  if (weekly) lines.push(weekly);
  if (total) lines.push(total);

  if (finite(input.balance)) {
    lines.push("", `💼 Balance: ${currency(input.balance, 0)}`);
  }

  const actions = input.actions ?? [];
  const actionLines = [
    tradeBullet(actions),
    moverBullet(input.movers ?? []),
    thesisBullet(actions),
  ].filter((line): line is string => Boolean(line));
  lines.push("", "⚡ PORTFOLIO ACTION");
  for (const line of actionLines) lines.push(`• ${line}`);

  const radar = radarLine(input.radar ?? []);
  if (radar) {
    lines.push("", "👀 ON RADAR", radar);
  }

  return lines.join("\n");
}

export function composeDailyFundPost(input: FundXPostInput): string {
  return composeFundXPost("DAY", input);
}

export function composeWeeklyFundPost(input: FundXPostInput): string {
  return composeFundXPost("WEEK", input);
}
