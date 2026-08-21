# Pass 4 — Caching & resilience fix log (Round 2)

Companion to `docs/audit/04-caching-resilience.md`. One row per finding.
**No row is Resolved without fresh re-verification by the method that
surfaced it.**

| # | Finding | Severity | Status | Attempts | Evidence |
|---|---|---|---|---|---|
| H1 | One request can amplify into thousands of upstream provider calls | High | **Resolved** | 1 | Counted: a repeat of the same unknown ticker went from 52 upstream calls to **0**; requests are now capped at 120 names |
| M1 | Circuit breaker returned nothing where a live failure returned an estimate | Medium | **Resolved** | 1 | Test with the breaker forced open: the scan now prices the position instead of returning null |
| — | Pass 2's claim that the market endpoints are unthrottled | — | **Withdrawn** | — | `limitPublicMarketRequest` is wired in `src/proxy.ts:47`. Corrected in the report |

## H1 — measured with a counter, then fixed, then measured again

The claim under test was "an unauthenticated request can drive unbounded
upstream load." A probe stubbed `yahoo-finance2` and counted invocations:

```
one made-up ticker  ->  quote() 35 + chart() 17  =  52 upstream calls
fifty made-up ...   ->  quote() 868 + chart() 850 = 1718 upstream calls
```

That is the exchange-suffix walk: 17 candidates, two calls each, and a hit
stops the walk — so only *misses* pay, and misses are what repeat.

Two changes, both of which ask the providers for **less**. Worth stating
against the brief's rule on provider limits: neither is an attempt to get
more quota, rotate anything, or disguise a request. They reduce the number
of requests the product makes.

1. **`MAX_TICKERS_PER_REQUEST = 120`** on `/api/quotes` and
   `/api/market/events`, returning 400 above it with `noStoreHeaders()` so
   the rejection cannot occupy the CDN. The number is a cost ceiling, not a
   UI limit: far above any real book, far below the point where one request
   hurts the providers everyone shares. This is the control the per-IP
   limiter cannot provide, because it counts requests and the cost is per
   ticker.

2. **A negative cache** (`src/lib/market/unresolvable.ts`). Anything that
   walked the whole chain and resolved nowhere is remembered for 10 minutes,
   so the second attempt costs nothing. Re-measured:

   ```
   first ask for ZZQQXX  ->  52 upstream calls
   second ask for ZZQQXX ->   0 upstream calls
   ```

   Three properties this had to keep, each pinned by a test:

   - **The answer does not change.** A remembered miss is still reported in
     `missing`, and still absent from `quotes`. The cheap path tells the
     caller exactly what the expensive path did.
   - **It expires.** Ten minutes, not hours — a real listing that was
     briefly unreachable must not be written off. A newly listed name
     appears the same session.
   - **It cannot become permanent.** A name skipped because it was already
     remembered is *not* re-stamped, so a symbol asked about every minute
     still gets a real retry every ten.

   Bounded at 500 entries with oldest-first eviction, so it cannot grow.

This helps ordinary users as much as it blunts abuse: a typo in a CSV import
or a delisted holding nobody removed used to cost 52 upstream calls on every
poll.

## M1 — the protection was the problem

`scanCoveredCall` answered a Yahoo exception with a synthetic premium
estimate and an *open breaker* with `null`. Since the breaker only opens
because Yahoo has been throwing, the reader got an estimate during a single
failure and an empty cell during a sustained one — the wrong way round.

Now both paths return the same estimate. Verified by forcing the breaker
open (three `noteMarketFailure("yahoo")` calls, threshold is 3) and checking
the scan still prices the position — and, in the same test, that it still
returns `null` when the position genuinely cannot carry a contract, so the
fix did not turn a real refusal into a fake number.

This closes the item Pass 1 flagged and deferred as "a wider degradation
question."

## Verified, not changed

- **Total outage.** With every provider failing and nothing cached, the
  chain reports both names in `missing`, returns no quotes, and sets
  `delayed`. Now pinned by a test, because "a hole in the table beats a fake
  NAV" is the most important promise this layer makes and nothing was
  guarding it.

## Deliberately not changed

- **The per-IP limiter stays in memory.** It is documented as memory-only,
  which on serverless means each isolate counts separately and the real
  allowance is a multiple of 120/min. Moving it to a durable store is
  infrastructure work with its own failure modes, and H1's per-request
  ceiling closes the amplification regardless of isolate count. Recorded in
  the report as an environment-blocked gap rather than papered over.
- **The 16-suffix walk itself.** It is what makes a Tallinn or Helsinki
  listing resolvable from a bare symbol, which is a real feature for this
  product's users. The cost was never the walk; it was paying for it
  repeatedly and without a bound.
