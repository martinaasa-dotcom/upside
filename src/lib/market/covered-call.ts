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
}): Promise<OptionCandidate | null> {
  const { ticker, spot, shares } = params;
  if (!spot) return null;

  const callPct = params.targetCallPct ?? STRATEGY.defaultCallPct;
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

  if (isMarketCircuitOpen("yahoo")) return null;

  try {
    const yf = await getYahoo();
    const chain = await withMarketCircuit("yahoo", () => yf.options(ticker));
    const expirations: Date[] = (chain.expirationDates ?? []).map(
      (d: Date | string) => (typeof d === "string" ? new Date(d) : d)
    );

    const nearby = expirations
      .map((exp) => ({
        exp,
        days: daysUntilInTz(exp),
        key: toDateKey(exp),
      }))
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
        otmPct
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
      otmPct
    );
  }
}

function syntheticCandidate(
  ticker: string,
  spot: number,
  contracts: number,
  callPct: number,
  stockTarget: number,
  nextStrike: number,
  otmPct: number
): OptionCandidate {
  const strike = nextStrike || roundToStrike(stockTarget * (1 + callPct));
  const days = STRATEGY.targetDays;
  const yield2w = estimateYield(otmPct || (strike - spot) / spot, days);
  const midPx = spot * yield2w;
  const exp = new Date();
  exp.setDate(exp.getDate() + days);
  const day = exp.getDay();
  const diff = (5 - day + 7) % 7;
  exp.setDate(exp.getDate() + diff);

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
