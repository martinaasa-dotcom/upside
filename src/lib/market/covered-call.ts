import { STRATEGY } from "@/lib/calculations";
import {
  nextStrikeFromTarget,
  resolveStockTarget,
  roundToStrike,
} from "@/lib/market/resistance";
import type { OptionCandidate } from "@/lib/types";
import { dateKeyInTz, daysUntilInTz } from "@/lib/timezone";
import { isMarketCircuitOpen, withMarketCircuit } from "@/lib/market/circuit-breaker";

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

function toDateKey(d: Date | string): string {
  return dateKeyInTz(d);
}

/**
 * Robust option mid: prefer bid/ask average, but fall back to last when the
 * spread is absurd (common on far-OTM names like VST).
 */
function optionMid(
  bid?: number | null,
  ask?: number | null,
  last?: number | null
): number {
  const b = bid ?? 0;
  const a = ask ?? 0;
  const l = last ?? 0;
  if (b > 0 && a > 0) {
    const m = (b + a) / 2;
    const spreadPct = (a - b) / m;
    if (spreadPct > 0.45 && l > 0 && l >= b * 0.25 && l <= a * 1.75) {
      return l;
    }
    return m;
  }
  return l || b || a || 0;
}

/** Rough estimate when the chain has no usable quote at the target strike. */
function estimateYield(otmPct: number, days: number): number {
  const tenor = days / STRATEGY.targetDays;
  const otmFactor = Math.max(0.25, 1 - Math.max(0, otmPct - 0.08) * 1.8);
  return STRATEGY.targetYield * tenor * otmFactor;
}

export async function scanCoveredCall(params: {
  ticker: string;
  spot: number;
  shares: number;
  targetCallPct?: number;
  /** Manual stock target from the CC table — must match UI Next Strike. */
  stockTarget?: number | null;
  priceHistory?: number[];
  /**
   * Expiry the user picked in the covered-call table (YYYY-MM-DD).
   *
   * Omitted, the scan keeps choosing the listed expiry nearest the
   * strategy's target tenor. Given, that date wins: the chain is searched
   * for it, and if the chain has no such date the synthetic estimate
   * prices that tenor instead. Either way the premium returned is for the
   * date asked for, so the table's Premium column always answers for the
   * expiry shown next to it.
   */
  expiry?: string | null;
}): Promise<OptionCandidate | null> {
  const { ticker, spot, shares } = params;
  if (!spot) return null;

  const callPct = params.targetCallPct ?? STRATEGY.defaultCallPct;
  const wantExpiry = normalizeExpiry(params.expiry);
  const history = params.priceHistory?.length
    ? params.priceHistory
    : [spot * 0.92, spot * 0.97, spot, spot * 1.05, spot * 1.1];

  const stockTarget =
    params.stockTarget != null && params.stockTarget > 0
      ? params.stockTarget
      : resolveStockTarget(spot, history);
  const nextStrike = nextStrikeFromTarget(stockTarget, callPct);
  const targetDistance = (stockTarget - spot) / spot;
  const contractCount = Math.max(0, Math.floor(shares / 100));
  const otmPct = nextStrike > 0 ? (nextStrike - spot) / spot : 0;

  if (contractCount < 1 || nextStrike <= 0) {
    return null;
  }

  // The breaker being open means Yahoo has been failing -- which is exactly
  // the condition the catch below already answers with a synthetic estimate.
  // Returning null here instead made the protected path degrade *worse* than
  // the unprotected one: a live failure showed the reader an estimate, and a
  // repeated failure showed them an empty row.
  if (isMarketCircuitOpen("yahoo")) {
    return syntheticCandidate(
      ticker,
      spot,
      contractCount,
      callPct,
      stockTarget,
      nextStrike,
      otmPct,
      wantExpiry
    );
  }

  try {
    const yf = await getYahoo();
    const chain = await withMarketCircuit("yahoo", () => yf.options(ticker));
    const expirations: Date[] = (chain.expirationDates ?? []).map(
      (d: Date | string) => (typeof d === "string" ? new Date(d) : d)
    );

    const dated = expirations.map((exp) => ({
      exp,
      days: daysUntilInTz(exp),
      key: toDateKey(exp),
    }));

    // A hand-picked expiry is an instruction, not a preference: price that
    // date even when it sits outside the tenor window the strategy would
    // normally shop in, and don't let a nearer listing win on tie-break.
    const picked = wantExpiry ? dated.find((e) => e.key === wantExpiry) : null;

    const nearby = picked
      ? [picked]
      : dated
          .filter(
            (e) =>
              e.days >= STRATEGY.minDaysPreferred - 3 &&
              e.days <= STRATEGY.maxDaysPreferred + 7
          )
          .sort(
            (a, b) =>
              Math.abs(a.days - STRATEGY.targetDays) -
              Math.abs(b.days - STRATEGY.targetDays)
          )
          .slice(0, 3);

    type Quoted = {
      expiration: string;
      daysToExpiry: number;
      strike: number;
      bid: number;
      ask: number;
      mid: number;
      strikeDist: number;
    };

    let best: Quoted | null = null;

    for (const { exp, days, key } of nearby) {
      const detailed = await withMarketCircuit("yahoo", () =>
        yf.options(ticker, { date: exp })
      );
      const calls = detailed.options?.[0]?.calls ?? [];
      if (!calls.length) continue;

      let nearest = calls[0];
      let nearestDist = Math.abs((nearest.strike ?? 0) - nextStrike);
      for (const call of calls) {
        const strike = call.strike ?? 0;
        if (!strike) continue;
        const dist = Math.abs(strike - nextStrike);
        if (dist < nearestDist) {
          nearest = call;
          nearestDist = dist;
        }
      }

      const strike = nearest.strike ?? 0;
      const bid = nearest.bid ?? 0;
      const ask = nearest.ask ?? 0;
      const last = nearest.lastPrice ?? 0;
      const m = optionMid(bid, ask, last);
      if (m <= 0 || !strike) continue;

      const candidate: Quoted = {
        expiration: key,
        daysToExpiry: days,
        strike,
        bid,
        ask,
        mid: m,
        strikeDist: nearestDist,
      };

      // Prefer closest strike; break ties with expiry closer to target tenor
      if (
        !best ||
        candidate.strikeDist < best.strikeDist - 1e-9 ||
        (Math.abs(candidate.strikeDist - best.strikeDist) < 1e-9 &&
          Math.abs(candidate.daysToExpiry - STRATEGY.targetDays) <
            Math.abs(best.daysToExpiry - STRATEGY.targetDays))
      ) {
        best = candidate;
      }
    }

    if (!best) {
      return syntheticCandidate(
        ticker,
        spot,
        contractCount,
        callPct,
        stockTarget,
        nextStrike,
        otmPct,
        wantExpiry
      );
    }

    // Reject quotes whose listed strike is wildly off the planned next strike
    // (illiquid chains) and fall back to estimate.
    const strikeErrorPct = best.strikeDist / Math.max(nextStrike, 1);
    let midPx = best.mid;
    let yield2w = midPx / spot;

    if (strikeErrorPct > 0.08) {
      yield2w = estimateYield(otmPct, best.daysToExpiry);
      midPx = spot * yield2w;
    }

    return {
      ticker: ticker.toUpperCase(),
      expiration: best.expiration,
      // Keep UI Next Strike (planned); mid/yield are for nearest listed strike
      strike: nextStrike,
      bid: best.bid,
      ask: best.ask,
      mid: midPx,
      otmPct,
      yield2w,
      premium: midPx * 100 * contractCount,
      contracts: contractCount,
      daysToExpiry: best.daysToExpiry,
      stockTarget,
      targetDistance,
    };
  } catch (err) {
    console.error(`Options scan failed for ${ticker}`, err);
    return syntheticCandidate(
      ticker,
      spot,
      contractCount,
      callPct,
      stockTarget,
      nextStrike,
      otmPct,
      wantExpiry
    );
  }
}

/**
 * A date key that is a real, future YYYY-MM-DD, or null.
 *
 * A past expiry would price at a negative tenor and hand back a negative
 * premium, so it is rejected here rather than propagating a nonsense
 * number into the table.
 */
function normalizeExpiry(raw: string | null | undefined): string | null {
  const key = raw?.trim();
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const when = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return null;
  return daysUntilInTz(when) > 0 ? key : null;
}

function syntheticCandidate(
  ticker: string,
  spot: number,
  contracts: number,
  callPct: number,
  stockTarget: number,
  nextStrike: number,
  otmPct: number,
  wantExpiry: string | null = null
): OptionCandidate {
  const strike = nextStrike || roundToStrike(stockTarget * (1 + callPct));
  let exp: Date;
  let days: number;
  if (wantExpiry) {
    // Price the tenor the user actually asked for. `estimateYield` scales
    // with days, so a later expiry earns a proportionally larger premium
    // and an earlier one a smaller — which is the whole point of letting
    // the date be edited.
    exp = new Date(`${wantExpiry}T00:00:00Z`);
    days = daysUntilInTz(exp);
  } else {
    days = STRATEGY.targetDays;
    exp = new Date();
    exp.setDate(exp.getDate() + days);
    const day = exp.getDay();
    const diff = (5 - day + 7) % 7;
    exp.setDate(exp.getDate() + diff);
  }
  const yield2w = estimateYield(otmPct || (strike - spot) / spot, days);
  const midPx = spot * yield2w;

  return {
    ticker: ticker.toUpperCase(),
    expiration: toDateKey(exp),
    strike,
    bid: midPx * 0.95,
    ask: midPx * 1.05,
    mid: midPx,
    otmPct: otmPct || (strike - spot) / Math.max(spot, 1),
    yield2w,
    premium: midPx * 100 * contracts,
    contracts,
    daysToExpiry: days,
    stockTarget,
    targetDistance: (stockTarget - spot) / Math.max(spot, 1),
  };
}
