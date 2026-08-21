import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { takeDurableRateLimitWeighted } from "@/lib/rate-limit-durable";
import type { RateLimitResult } from "@/lib/rate-limit";

/**
 * A shared budget for the one market operation that is genuinely expensive:
 * looking up a symbol that resolves nowhere.
 *
 * ## Why not simply limit requests per IP
 *
 * There already is such a limit -- `limitPublicMarketRequest`, 120 requests
 * a minute. It has two problems, and only one of them is fixable by turning
 * the number down.
 *
 * The first is that it lives in memory, so on Vercel each warm instance
 * keeps its own count and the real allowance is 120 times however many
 * instances happen to be up. That is the fixable half, and this module
 * fixes it by putting the count in Postgres where every instance shares it.
 *
 * The second is that **requests are the wrong unit**. Pass 4 measured a
 * single unauthenticated GET costing 1,718 upstream Yahoo calls, because
 * cost is per ticker and an unresolvable ticker walks 16 European exchange
 * suffixes at two calls each. Under a request limiter that is one request
 * out of 120. Turning the limit down does not help: the same damage fits in
 * one request.
 *
 * ## Why the budget is not "tickers per IP"
 *
 * That was the obvious next idea and it is wrong for this product
 * specifically. A classroom is a first-class feature here, and a school
 * puts thirty students behind one NAT address. Thirty students with twenty
 * holdings each, refreshing, is thousands of perfectly legitimate ticker
 * lookups per minute from a single IP. A ticker budget would take the
 * classroom offline and leave the abuse case largely intact, since an
 * attacker can simply use more addresses.
 *
 * So the budget counts the thing the abuser does and the classroom does
 * not: **names that resolve nowhere and were not already known to be dead.**
 * Thirty students looking up real listings spend nothing from this budget.
 * A script inventing symbols spends all of it, because every invented
 * symbol is a fresh full-cost walk.
 *
 * Three properties follow, all of them wanted:
 *
 * - **Ordinary use never touches the database.** The charge only happens on
 *   requests that actually produced new dead names, which for real books is
 *   almost never. No round trip is added to the hot path.
 * - **Repeats are free, so honest mistakes are cheap.** A CSV with a typo
 *   in it costs its dead names once. Every later refresh finds them in the
 *   negative cache and is charged nothing, because it cost nothing.
 * - **The charge is honest about what happened.** It is levied after the
 *   fetch, against work already done, rather than guessed at beforehand.
 */

/**
 * Dead names per address per window. Far above any honest accident -- a
 * whole import file of typos costs a fraction of this -- and far below the
 * volume that makes scraping worthwhile. At the ceiling an address can
 * provoke roughly `LIMIT * 52` upstream calls per window instead of an
 * unbounded number.
 */
export const UNRESOLVED_LIMIT = 40;
export const UNRESOLVED_WINDOW_MS = 10 * 60 * 1000;

function budgetKey(req: Request): string {
  return `mkt-dead:${clientIp(req)}`;
}

/**
 * Is this address already over budget? Charges nothing, and deliberately
 * asks memory only.
 *
 * Consulting Postgres here would be the obvious way to make the answer
 * authoritative on a cold instance -- and it would put a database round
 * trip in front of every quote request the product serves, to tell honest
 * callers "yes, fine" millions of times over. That is a worse trade than
 * the gap it closes, and it would undo the work of the performance pass.
 *
 * The shared bucket is still what decides: `chargeUnresolvedBudget` writes
 * to it, and a refusal from it is written back into this instance's memory
 * by `takeDurableRateLimitWeighted`. So an instance learns the moment it
 * serves one offending request, and refuses for free from then on.
 *
 * The residual, stated plainly: an address spraying invented symbols gets
 * one request through per instance it has not yet been refused by, rather
 * than the unbounded number it got before. That is a ceiling of roughly
 * (instances x one request), and every one of those requests is itself
 * capped at `MAX_TICKERS_PER_REQUEST`.
 */
export function checkUnresolvedBudget(req: Request): RateLimitResult {
  return checkRateLimit(
    budgetKey(req),
    UNRESOLVED_LIMIT,
    UNRESOLVED_WINDOW_MS,
    0
  );
}

/**
 * Bill an address for the dead names its request just discovered.
 *
 * No-op when the request produced none, which is the overwhelmingly common
 * case and the reason this costs nothing in normal use. This is the only
 * call in the pair that reaches Postgres, and it reaches it precisely when
 * something expensive has just happened.
 */
export async function chargeUnresolvedBudget(
  req: Request,
  newlyUnresolvable: readonly string[]
): Promise<void> {
  if (newlyUnresolvable.length === 0) return;
  await takeDurableRateLimitWeighted(
    budgetKey(req),
    UNRESOLVED_LIMIT,
    UNRESOLVED_WINDOW_MS,
    newlyUnresolvable.length
  );
}
