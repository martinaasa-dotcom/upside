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

vi.mock("@/lib/supabase/server", () => ({
  supabaseUsesServiceRole: () => serviceRole,
  getSupabaseServer: () =>
    serviceRole
      ? {
          rpc: async (fn: string, args: Record<string, unknown>) => {
            rpcCalls.push({ fn, args });
            return { data: rpcResult, error: null };
          },
        }
      : null,
}));

import {
  UNRESOLVED_LIMIT,
  chargeUnresolvedBudget,
  checkUnresolvedBudget,
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
});

describe("unresolved-symbol budget", () => {
  it("does not touch the database when every name resolved", async () => {
    const req = freshReq();
    expect(checkUnresolvedBudget(req).ok).toBe(true);
    await chargeUnresolvedBudget(req, []);

    // The whole point: normal traffic adds no round trip to the hot path.
    expect(rpcCalls).toHaveLength(0);
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

    rpcResult = { ok: false, retryAfterSec: 300 };
    await chargeUnresolvedBudget(abuser, ["FAKE1", "FAKE2"]);

    expect(checkUnresolvedBudget(abuser).ok).toBe(false);
    expect(checkUnresolvedBudget(bystander).ok).toBe(true);
  });

  it("remembers a refusal locally, so the next request costs no round trip", async () => {
    const req = freshReq();
    rpcResult = { ok: false, retryAfterSec: 300 };
    await chargeUnresolvedBudget(req, ["FAKE"]);
    const callsAfterRefusal = rpcCalls.length;

    // Refused from memory now -- no further database traffic to say so.
    const peek = checkUnresolvedBudget(req);
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
      expect(checkUnresolvedBudget(school).ok).toBe(true);
      await chargeUnresolvedBudget(school, []);
    }
    expect(rpcCalls).toHaveLength(0);
  });

  it("stays open when the database is unreachable", async () => {
    const req = freshReq();
    serviceRole = false;

    // No service role -> no shared bucket. A limiter must not take the
    // product down because its bookkeeping is unavailable.
    await chargeUnresolvedBudget(req, ["FAKE1", "FAKE2"]);
    expect(rpcCalls).toHaveLength(0);
    expect(checkUnresolvedBudget(req).ok).toBe(true);
  });

  it("blocks once the shared bucket is spent, even on a fresh instance's memory", async () => {
    const req = freshReq();
    // Under budget locally, but Postgres has seen this address on other
    // instances and says no. The shared answer must win.
    rpcResult = { ok: false, retryAfterSec: 420 };
    await chargeUnresolvedBudget(req, ["ONE"]);
    expect(checkUnresolvedBudget(req)).toEqual({
      ok: false,
      retryAfterSec: expect.any(Number),
    });
  });
});
