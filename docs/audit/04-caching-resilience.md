# Pass 4 — Caching & data provider resilience (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `a0a60cb` (main, after Pass 3 closed)

> Round 2 re-derivation. **Including a correction to Pass 2's own hand-off**,
> which turned out to be wrong when re-checked. Numbers below are counted
> upstream calls, not estimates.

**Headline:** the fallback chain is the best-built part of this codebase —
memory → Supabase-persisted last-known → Yahoo → Twelve Data → Finnhub →
stale, with per-provider circuit breakers and no invented prices. Two things
were wrong with it, and both are cases where the *protective* mechanism was
the problem: a rate limiter counting the wrong unit, and a circuit breaker
degrading worse than the failure it protects against.

---

## Correction to Pass 2

Pass 2 handed this pass a finding: *"public market endpoints (`quotes`,
`market/*`, `popular-tickers`) are unauthenticated and unthrottled."*

**The second half is wrong.** `limitPublicMarketRequest` (`rate-limit.ts:140`)
caps them at 120 requests per minute per IP and **is wired up**, in
`src/proxy.ts:47`. Pass 2 searched the route files and the middleware file it
expected; Next 16 renamed middleware to `proxy.ts`, and the limiter lives
there. Recorded plainly rather than quietly dropped — a re-audit that only
corrects other people's claims is not doing its job.

What Pass 2 was right about is that something is wrong here. It is just not
the thing it named. See H1.

---

## Findings

### H1 — High: the limiter counts requests; the cost is per *ticker*

*Files:* `src/app/api/quotes/route.ts`, `src/lib/market/quotes.ts`,
`src/lib/ticker.ts:166`

`yahooQuoteCandidates` walks the bare symbol plus **16 European exchange
suffixes**, and each candidate costs a `quote()` and a `chart()`. The walk
stops at the first hit, so a *known* name costs one round trip. A name that
resolves nowhere pays the whole walk.

**Measured** by stubbing `yahoo-finance2` and counting invocations:

| single unauthenticated GET | upstream Yahoo calls |
|---|---|
| one made-up ticker | **52** (35 `quote`, 17 `chart`) |
| fifty made-up tickers | **1 718** |

`?tickers=` had **no cap**, and `fetchQuotesYahoo` fans out with
`Promise.all`, so the calls go out concurrently. Within the 120-requests-per-
minute allowance, one IP could drive upstream call volume into the hundreds
of thousands per minute without ever tripping the limiter — because the
limiter counts requests and the cost is per ticker.

The damage is not to Yahoo. It is **self-inflicted**: it burns the free-tier
quotas the whole product shares and trips the app's own circuit breakers, so
every real user's prices go stale. Ordinary users hit a small version of the
same thing — a typo in a CSV import, or a delisted holding nobody removed,
costs 52 upstream calls *every poll*.

*Severity:* **High.** Unauthenticated, trivially triggered, and it degrades
the service for everyone rather than just the caller.

*Fix:* a per-request ticker ceiling and a short-lived negative cache — see
the fix log. Both reduce provider load; neither is an attempt to obtain more
quota.

### M1 — Medium: the circuit breaker degraded worse than the failure

*File:* `src/lib/market/covered-call.ts:100`

`scanCoveredCall` had two failure paths that disagreed:

```ts
if (isMarketCircuitOpen("yahoo")) return null;   // breaker open -> nothing
try { … } catch { return syntheticCandidate(…) } // Yahoo threw -> estimate
```

The breaker only opens *because* Yahoo has been throwing. So a first failure
showed the reader a synthetic premium estimate, and a repeated failure —
the worse situation — showed them an empty row. The protection made the
outcome worse than no protection.

This is the item Pass 1 flagged as "`scanCoveredCall` returns null once the
Yahoo breaker trips" and deferred as a wider degradation question. This is
that question, answered.

*Severity:* **Medium.** Only reaches users with `knows_options === true`, and
the wrong answer is an empty cell rather than a wrong number — but an empty
cell during an outage is exactly when the estimate was worth having.

---

## What passed, with evidence

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Cache read path is primary, not an afterthought | **Pass** | `fetchQuotesWithFallback` calls `recallQuotes` **before** touching any provider, then merges cached values for anything unresolved |
| 2 | Cache survives a cold function | **Pass** | `quote-store.ts` is memory *and* Supabase, capped at 400 entries and 7 days, so a fresh isolate still fails over |
| 3 | Provider chain is real, not decorative | **Pass** | Yahoo → Twelve Data → Finnhub, each dynamically imported and each gated on its own `…Configured()` so a missing key skips rather than throws |
| 4 | Circuit breakers per provider, with backoff | **Pass** | 3 failures to open, exponential to a 5-minute ceiling, half-open probe. `circuit-breaker.test.ts` covers it |
| 5 | **Total outage produces no invented prices** | **Pass — tested** | With every provider stubbed to fail and nothing cached: `missing` lists both names, `quotes` is empty, `delayed` is true. A hole in the table, not a fake NAV |
| 6 | Staleness reaches the user | **Pass** | `StaleQuotesBanner` and `AppStatusStrip` both read the `delayed` flag and the quote age |
| 7 | CDN headers actually reach the edge | **Pass** | `publicCdnHeaders` sets `CDN-Cache-Control` and `Vercel-CDN-Cache-Control` as well as `Cache-Control`, because Next stamps route handlers `no-store` and a bare `s-maxage` never arrives. TTL varies by market session (15s open, 60s closed) |
| 8 | Errors do not occupy the CDN | **Pass** | `noStoreHeaders()` exists and is used on error responses |
| 9 | Two tabs asking for the same names share a cache entry | **Pass** | `quotesUrl` sorts and dedupes the ticker list so URL order cannot fragment the edge cache |
| 10 | In-flight de-duplication | **Pass** | `quoteInFlight` shares a pending promise per ticker within an isolate |
| 11 | Other breaker early-returns | **Pass** | 17 other `isMarketCircuitOpen` guards all return an empty value to a caller with no offline fallback — correct. `trends-cache.ts:104` returns null from a function named `…Uncached`, whose caller serves the stale row |

## Unable to Verify (Environment-Blocked)

Carried into Pass 11 as gaps, not passes:

1. **Real provider behaviour under real rate limiting.** The fan-out counts
   are exact, but they are counts of calls the code *would* make; no request
   left this sandbox. How Yahoo actually responds to 1 718 concurrent
   requests, and how quickly the free tiers cut off, is not measurable here.
2. **The per-IP limiter across isolates.** `checkRateLimit` is explicitly
   memory-only, so on serverless each isolate keeps its own counter and the
   real allowance is some multiple of 120/min. Recorded rather than changed —
   moving it to a durable store is infrastructure work, and H1's per-request
   ceiling closes the amplification regardless of how many isolates exist.
3. **CDN hit rates in production.** Header correctness is verified by
   reading; whether Vercel's edge is actually serving these is not.
