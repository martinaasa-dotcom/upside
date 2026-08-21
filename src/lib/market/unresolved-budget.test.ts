/**
 * The budget that decides how much unresolvable-symbol lookup one address
 * gets. The properties worth pinning are the ones a careless change would
 * quietly break: that honest traffic is never charged or blocked, that the
 * shared verdict is remembered locally, and that a classroom behind one
 * address is not mistaken for a scraper.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcResult: unknown = { ok: true };
let serviceRole = true;
/**
 * Which bucket keys the shared limiter refuses. The real RPC is keyed by
 * `p_key`, so a mock that ignores the key would let a test "prove" that one
 * address blocks another when the code is in fact perfectly well isolated.
 * Empty means `rpcResult` applies to every key.
 */
const blockedKeys = new Set<string>();

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => serviceRole,
  getSupabaseServer: () =>
    serviceRole
      ? {
          rpc: async (fn: string, args: Record<string, unknown>) => {
            rpcCalls.push({ fn, args });
            if (blockedKeys.size > 0) {
              return {
                data: blockedKeys.has(String(args.p_key))
                  ? { ok: false, retryAfterSec: 300 }
                  : { ok: true },
                error: null,
              };
            }
            return { data: rpcResult, error: null };
          },
        }
      : null,
}));

import { resetRateLimitForTests } from "@/lib/rate-limit";
import {
  UNRESOLVED_LIMIT,
  chargeUnresolvedBudget,
  checkUnresolvedBudget,
  resetUnresolvedBudgetForTests,
} from "@/lib/market/unresolved-budget";

/** Distinct addresses per test, so buckets never leak between them. */
let addr = 0;
function reqFrom(ip: string): Request {
  return new Request("https://upsidelab.app/api/quotes?tickers=AAPL", {
    headers: { "x-vercel-forwarded-for": ip },
  });
}
function freshReq(): Request {
  addr += 1;
  return reqFrom(`198.51.100.${addr}`);
}

beforeEach(() => {
  rpcCalls.length = 0;
  rpcResult = { ok: true };
  serviceRole = true;
  blockedKeys.clear();
  resetUnresolvedBudgetForTests();
});

describe("unresolved-symbol budget", () => {
  it("charges nothing when every name resolved", async () => {
    const req = freshReq();
    expect((await checkUnresolvedBudget(req)).ok).toBe(true);
    await chargeUnresolvedBudget(req, []);

    // At most one authoritative peek, and it must be a peek: cost 0, so it
    // consumes nothing and cannot create a bucket.
    expect(rpcCalls.every((c) => c.args.p_cost === 0)).toBe(true);
  });

  it("asks the shared bucket once per address, then reuses the answer", async () => {
    const req = freshReq();

    // First call on a cold instance must be authoritative -- this is the
    // per-instance freebie an earlier version of this module handed out.
    expect((await checkUnresolvedBudget(req)).ok).toBe(true);
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_cost).toBe(0);

    // Everything after it rides the cached "ok" -- no round trip per
    // request, which is what made the authoritative version affordable.
    for (let i = 0; i < 50; i++) {
      expect((await checkUnresolvedBudget(req)).ok).toBe(true);
    }
    expect(rpcCalls).toHaveLength(1);
  });

  it("cannot be farmed by landing on a fresh instance every request", async () => {
    /*
     * The attack the memory-only peek could not stop, and the reason this
     * module now consults the shared bucket.
     *
     * Serverless spreads requests across instances, and an instance that
     * has never met a caller has nothing in memory to refuse them with. If
     * the peek only ever asked memory, an attacker got one free request per
     * instance -- measured at 15 of 20 requests slipping past a spent
     * budget, which is not a limiter at all.
     *
     * Every iteration below wipes both caches, i.e. every request lands on
     * a brand-new instance.
     */
    const ip = "198.51.100.240";
    blockedKeys.add(`mkt-dead:${ip}`);

    let served = 0;
    for (let i = 0; i < 20; i++) {
      resetUnresolvedBudgetForTests();
      resetRateLimitForTests();
      if ((await checkUnresolvedBudget(reqFrom(ip))).ok) served++;
    }

    expect(served).toBe(0);
  });

  it("refuses a cold instance's first request when the shared bucket says no", async () => {
    // The gap this closes: this instance has never met the address and its
    // memory is empty, but Postgres has been watching it spray invented
    // symbols at every other instance. It must not get one free request.
    const req = freshReq();
    rpcResult = { ok: false, retryAfterSec: 300 };

    const verdict = await checkUnresolvedBudget(req);
    expect(verdict.ok).toBe(false);
    expect(verdict.retryAfterSec).toBeGreaterThan(0);
  });

  it("charges the shared bucket once, weighted by dead names found", async () => {
    const req = freshReq();
    await chargeUnresolvedBudget(req, ["NOPE1", "NOPE2", "NOPE3"]);

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe("portfell_rate_take_weighted");
    // Three names, not one request.
    expect(rpcCalls[0].args.p_cost).toBe(3);
    expect(rpcCalls[0].args.p_limit).toBe(UNRESOLVED_LIMIT);
  });

  it("keys the budget by address, so one abuser cannot block another user", async () => {
    const abuser = freshReq();
    const bystander = freshReq();

    // Only the abuser's own bucket is over. The bystander shares nothing
    // with them but the endpoint.
    blockedKeys.add(`mkt-dead:198.51.100.${addr - 1}`);
    await chargeUnresolvedBudget(abuser, ["FAKE1", "FAKE2"]);

    expect((await checkUnresolvedBudget(abuser)).ok).toBe(false);
    expect((await checkUnresolvedBudget(bystander)).ok).toBe(true);
  });

  it("remembers a refusal locally, so the next request costs no round trip", async () => {
    const req = freshReq();
    rpcResult = { ok: false, retryAfterSec: 300 };
    await chargeUnresolvedBudget(req, ["FAKE"]);
    const callsAfterRefusal = rpcCalls.length;

    // Refused from memory now -- no further database traffic to say so.
    const peek = await checkUnresolvedBudget(req);
    expect(peek.ok).toBe(false);
    expect(peek.retryAfterSec).toBeGreaterThan(0);
    expect(rpcCalls).toHaveLength(callsAfterRefusal);
  });

  it("lets a classroom of real tickers through untouched", async () => {
    // Thirty students behind one school NAT, twenty real holdings each,
    // refreshing repeatedly. Every name resolves, so nothing is charged and
    // nothing is ever refused -- which a per-ticker limiter would not manage.
    const school = reqFrom("203.0.113.7");
    for (let i = 0; i < 30 * 20; i++) {
      expect((await checkUnresolvedBudget(school)).ok).toBe(true);
      await chargeUnresolvedBudget(school, []);
    }
    // 600 lookups of real listings cost exactly one authoritative peek and
    // not a single unit of budget. A per-ticker limiter would have refused
    // this address long before here.
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args.p_cost).toBe(0);
  });

  it("stays open when the database is unreachable", async () => {
    const req = freshReq();
    serviceRole = false;

    // No service role -> no shared bucket. A limiter must not take the
    // product down because its bookkeeping is unavailable.
    await chargeUnresolvedBudget(req, ["FAKE1", "FAKE2"]);
    expect(rpcCalls).toHaveLength(0);
    expect((await checkUnresolvedBudget(req)).ok).toBe(true);
  });

  it("blocks once the shared bucket is spent, even on a fresh instance's memory", async () => {
    const req = freshReq();
    // Under budget locally, but Postgres has seen this address on other
    // instances and says no. The shared answer must win.
    rpcResult = { ok: false, retryAfterSec: 420 };
    await chargeUnresolvedBudget(req, ["ONE"]);
    expect(await checkUnresolvedBudget(req)).toEqual({
      ok: false,
      retryAfterSec: expect.any(Number),
    });
  });
});
