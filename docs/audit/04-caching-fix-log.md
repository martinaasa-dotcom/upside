# Pass 4 — Caching & data provider resilience: fix log

One row per finding in [`04-caching.md`](04-caching.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file, `npm run test`
111/111, `npm run test:invariants` at its 2 pre-existing failures.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| C1 | Thesis Pulse's portfolio summary was one global, unscoped in-memory cache | Critical | **Resolved** (prior session) | Report §Critical 1 | Fixed when the pass was first run, merged to `main`. |
| C2 | A shared browser's Lab conviction notes could be adopted into a different signed-in user's account | Critical | **Resolved** (prior session) | Report §Critical 2; `src/components/use-lab-sync.ts` still carries the comment explaining why local notes never auto-mark dirty | Fixed when the pass was first run. |
| M1 | `/api/thesis/pulse` sent a self-contradictory `Cache-Control` | Medium | **Resolved** | `src/app/api/thesis/pulse/route.ts:374-378` — now `private, no-store`. The old value paired `private` (shared caches must not store) with `s-maxage` (a shared-cache-only directive). | No behaviour change today (the route is `POST`, which Vercel's edge doesn't cache regardless), but the header now describes what the code actually relies on: the in-memory server cache, not HTTP caching. |
| M2 | No per-ticker in-flight coalescing on the quote fetch path | Medium | **Resolved** | `src/lib/market/yahoo.ts:342-356` (`quoteInFlight`) and the `resolveOne` wrapper at 375-400. Semantics verified with a throwaway vitest against the exact map/`finally` shape: 3 concurrent asks for one ticker → **1** upstream call; 2 different tickers → **2** calls; a second ask after the first settles → a fresh call, map back to size 0 (no stale pinning). | Closes the specific gap the report named: `/api/quotes` is CDN-cached per ticker-**set**, so it dedupes one person polling, but two people whose portfolios merely overlap on a popular name have different sets and each used to fetch that symbol separately. A joiner rides the first caller's `fx`/`period1`, which is documented at the map — the promise only lives for one in-flight fetch. Same shape as the existing `ytdCloseInFlight`. |
| M3 | The per-ticker Pulse cache could serve one user's position numbers to another | Medium | **Resolved** | `src/app/api/thesis/pulse/route.ts:117-131`. When the holder has written no thesis — the case where `getPulseCacheKey` falls back to the shared `"nothesis"` key — the prompt now says `(in their portfolio)` instead of `X% of book · lifetime ROI Y%`. | Took the report's first option (drop the personal numbers from the shared-key prompt) over its second (fold a user id into the key). Folding in a user id would have made the cache per-user and destroyed the point of it — this keeps the LLM-call saving while removing the only user-identifying data in that prompt. A written thesis makes the key private again, and those requests keep their full position context. |
| M4 | Other `localStorage` client caches are unscoped by user | Medium | **Deferred** (no change needed) | — | The report's own conclusion: all of them match the `upside-*`/`portfell-*`/`sb-*` prefixes that `purgeClientSession()` wipes on account switch, and none push local data back to a different user's server row. It explicitly recommended no further code change; listed so a later pass doesn't re-discover the same sweep. |
| L1 | `portfell_quote_cache` is a hard 7-day TTL, not stale-while-revalidate | Low | **Deferred** (no change needed) | — | Confirmed correct as-is. It is a last-known-print failover table, not the primary cache, so a hard TTL is the right shape. The report recorded this only because the brief asked for it to be checked explicitly. |
| L2 | Circuit-breaker state is per-process | Low | **Deferred** | — | Inherent to serverless without a shared store. `AGENTS.md`'s documented mitigation is the multi-provider fallback chain, not a distributed breaker. Closing it needs the same external store as Pass 2's M1 — an infrastructure decision, not a code fix. |

## Deferred summary

Four items left unfixed, none silently: **M4** and **L1** the report
itself concluded need no change, and both are recorded above with that
reasoning; **L2** needs the same shared store as Pass 2's distributed
rate-limiting item, which is an infrastructure and cost decision for
Martin rather than a code change.
