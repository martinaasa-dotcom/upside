# Pass 4 — Caching Audit

Scope: the `portfell_quote_cache` last-known-quote table and its
read/write path (`src/lib/market/quote-store.ts`, `src/lib/market/quotes.ts`),
Next.js Data Cache / `fetch()` caching and `dynamic`/`revalidate` route
exports across `src/app/api/*` and `src/app`, HTTP `Cache-Control` headers
(`src/lib/cdn-cache.ts`, `next.config.ts`), the cron-populated
popular-tickers and nightly-snapshot read paths, Stripe/billing data at
rest client-side, and every `localStorage`-backed client cache under
`src/lib/*` for cross-account key collisions on a shared browser profile.
Read against `AGENTS.md` first so intentional patterns (the multi-provider
market-data/LLM fallback chains, the durable last-known-quote table, the
`portfell-locked` demo Save lock, per-owner Lab sync) weren't re-flagged as
bugs.

Branch: `claude/audit-caching`, based on `origin/main` @ `c75b85f`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 2 | 2 |
| High | 0 | — |
| Medium | 4 | 0 (backlog) |
| Low | 2 | 0 (backlog) |

`npm run typecheck` and `npm run lint` are clean after the fixes.
`npx tsx scripts/test-invariants.ts` shows the same 2 pre-existing,
unrelated failures called out in the task (`circle awards are a grid of
cards, not a flat divided list` and `Fund page labels Margus's note
Thesis`) and nothing new (182 passing).

---

## Critical

### 1. Thesis Pulse's portfolio summary was one global, unscoped in-memory cache — served to whichever user hit the fallback path next

**Where:** `src/lib/thesis-pulse-server-cache.ts:25,94-108` (now
`SUMMARY_CACHE`) and `src/app/api/thesis/pulse/route.ts:78-89,257-273,339-347,369`
(`reuseCachedPulse`, `getCachedPulseSummary`/`setCachedPulseSummary` call
sites).

**What's wrong:** `getCachedPulseSummary()` / `setCachedPulseSummary()`
read and wrote a single module-level variable, `LATEST_SUMMARY_CACHE`,
shared by every request the server process ever handles — not keyed by
user, portfolio, or anything else. The value it stores is the Pulse
report's `summary` field, which the prompt explicitly asks the model to
make personal: *"one short sentence on the portfolio as a whole, you/your.
Name the 5% movers (up or down) and whether any call left Hold."* That
sentence names specific tickers in **that user's own book** and whether a
specific call left Hold — i.e. it is that user's private portfolio
content, not generic market commentary.

`reuseCachedPulse()` — which serves this cached summary back verbatim —
is not a rare corner case. It's hit whenever: every candidate is already
served from the per-ticker cache; the per-user rate limit
(`takeDurableRateLimit`, 12 calls / 10 min) is exceeded; no LLM provider
is configured; the shared background-LLM slot is busy
(`chatIsBusy() || !beginBackgroundLlm()`); or the live generation throws.
The busy-slot and rate-limit paths in particular are *more* likely to
trigger, not less, exactly when many different users open Pulse at
once — precisely the "50 concurrent users" scenario this pass is about.
Any two different users landing on that fallback within the cache's
1-hour TTL (`PULSE_SERVER_FRESH_TTL_MS`) would see one of them's private
portfolio sentence rendered in the other's UI.

**Fix (implemented):** `SUMMARY_CACHE` is now a `Map<userId, {summary,
cachedAt}>`, bounded the same way the existing per-ticker cache already
is (evict the oldest 50 once it passes 300 entries — same shape as
`prunePulseCacheIfNeeded`). `getCachedPulseSummary(userId)` /
`setCachedPulseSummary(userId, summary)` take the caller's id, and every
call site in `route.ts` (`reuseCachedPulse`, the live-generation success
path, and the four `reuseCachedPulse` fallback call sites) now passes
`auth.user.id`.

### 2. A shared browser's Lab conviction notes (thesis text) could be silently adopted and pushed into a different signed-in user's account

**Where:** `src/lib/conviction.ts:23` (`upside-conviction-v1`, unscoped
by user), `src/components/use-lab-sync.ts:24-46`,
`src/lib/lab-sync-client.ts:14-16` (`mirrorLabLocal`).

**What's wrong:** Lab conviction notes — per-ticker thesis text and
conviction level, `AGENTS.md`: *"Lab conviction notes sync via
`portfell_lab_state` **per owner**"* — are correctly scoped by
`owner_id` server-side (`src/app/api/lab/route.ts:37`), but the client
cache key is a single global `localStorage` key with no user or portfolio
scoping at all. On sign-out via the "Sign out" button this is cleared by
`purgeClientSession()` (`src/lib/auth/purge-session.ts`), but nothing
cleared it on a **passive** session end — a token that simply expired, or
a different account signing in on the same device without the previous
person explicitly clicking Sign out (a shared family computer, a friend
trying the app on a borrowed laptop — exactly the audience `AGENTS.md`
says the product is now opening up to).

Worse than a display glitch: `useLabSync`'s mount effect
(`use-lab-sync.ts:24-33`) read this unscoped local cache and, whenever
the *current* signed-in user's own remote `portfell_lab_state` row was
empty (i.e. any new signup, or anyone who simply hadn't written a Lab
note yet), treated whatever was sitting in `localStorage` as *this
account's own unsynced edits* and both rendered it **and** flagged it
dirty for auto-save — which pushes it to the current user's own
`portfell_lab_state` row a few hundred milliseconds later
(`pushLabBundle`). A previous account's private thesis notes could end up
permanently written into a different, unrelated account's own database
row, not just flashed on screen.

**Fix (implemented):**
1. `src/components/AuthProvider.tsx` — both places a resolved session's
   user id is accepted (`refresh()`'s `getUser()` result, and the
   `onAuthStateChange` listener) now compare it against `loadLastUser()`'s
   previously-stored id first. On a mismatch (a different account than
   whatever this browser last had signed in), `purgeClientSession()` runs
   — wiping every `upside-*`/`portfell-*`/`sb-*` `localStorage` key except
   the explicitly-exempted demo/lock keys, plus IndexedDB — **before** the
   new user is exposed to the rest of the app, so components that mount
   once `ready` flips true see a clean slate.
2. `src/components/use-lab-sync.ts` — independent of the above (defense
   in depth against the timing race between an optimistic
   last-known-user stub and the async session confirmation): the
   "remote is empty, local has data" branch still *shows* the local data
   (so a genuine new signup with pre-auth local notes still sees them —
   the one legitimate reason this fallback exists) but no longer marks it
   dirty automatically. Only a real edit through `patchLab` marks the
   bundle dirty and triggers a save, so stale local data from a different
   account can no longer get silently written into this account's row.

---

## Medium (backlog, not fixed this pass)

- **`src/app/api/thesis/pulse/route.ts:360` header is self-contradictory.**
  `"Cache-Control": "private, s-maxage=300, stale-while-revalidate=1800"`
  combines `private` (shared caches must not store the response) with
  `s-maxage` (a shared-cache-only directive). Low practical risk today —
  the route is `POST` and Vercel's edge network does not cache `POST`
  responses regardless of headers — but the header is misleading and
  would matter if this route, or a copy-pasted version of it, ever became
  a `GET`. Drop `s-maxage`/`stale-while-revalidate`; keep `private,
  no-store` or `private, max-age=0` to match what the code actually
  relies on (the in-memory `getCachedPulseCheck`/`getCachedPulseSummary`
  server cache, not HTTP caching).

- **No per-ticker in-flight request coalescing on the quote fetch path.**
  `src/lib/market/quotes.ts:136` (`fetchQuotesYahoo(unique)`) and
  `src/lib/market/yahoo.ts` have no equivalent of the `ytdCloseInFlight`
  promise map (`yahoo.ts:408`) for the main quote fetch. `/api/quotes`
  (`src/app/api/quotes/route.ts`) is cached at the CDN edge
  (`publicCdnHeaders`, 15s open / 60s closed + stale-while-revalidate),
  which fully dedupes *repeat polling by the same user* (identical
  ticker-set query string), and Yahoo failures are contained by the
  per-provider circuit breaker (`src/lib/market/circuit-breaker.ts`,
  opens after 3 failures, exponential backoff) plus the multi-provider
  fallback chain — so a storm degrades to stale/cached prices rather than
  erroring, matching the intentional design in `AGENTS.md`. What is
  **not** deduped: many *different* users whose portfolios overlap on a
  popular name (e.g. everyone holds some AAPL, but each person's full
  ticker set — and therefore cache key — differs) each cause their own
  origin call for the same underlying ticker, and within a single warm
  serverless instance there's no promise-sharing across concurrent
  requests either. Not urgent at current scale given the breaker +
  fallback chain; if/when concurrent user counts grow, add a per-ticker
  in-flight `Map<string, Promise<Quote>>` inside `fetchQuotesYahoo`
  (same shape as `ytdCloseInFlight`) so concurrent requests for the same
  ticker within one instance share one upstream call.

- **The per-ticker Pulse check cache can be shared across users who both leave the thesis note empty.**
  `src/lib/thesis-pulse-server-cache.ts:39-46` (`getPulseCacheKey`) keys
  by `ticker:moveBucket:thesisKey`, where `thesisKey` is derived from the
  user's own thesis text — this is good (different thesis text can't
  collide), but two different users who both hold the same ticker, see
  the same move bucket, and have written **no** thesis note both hash to
  the same `"nothesis"` key. Lower severity than Critical #1 above
  because unlike the summary, the underlying content is a take on public
  headlines/price action, not user-identifying; but the prompt
  (`buildPrompt`, `route.ts:112-124`) does hand the model each holder's
  `bookPct`/`roiPct`, so a generated `verdict`/`situation` line could in
  principle echo a number that belonged to whoever populated the cache
  first. If this needs closing, either exclude `bookPct`/`roiPct` from
  the prompt context that feeds a shared-key ("nothesis") response, or
  fold a coarse `userId` into the key for that bucket.

- **Several other `localStorage` client caches are unscoped by user, same class of bug as Critical #2, but read-only (no auto-push) so the residual risk is display-only, not data corruption.** `watchlist.ts` (`upside-watchlist-v1`), `pulse-history.ts`
  (`upside-pulse-history-v1`), `thesis-pulse.ts`'s ticker/summary caches
  (`upside-pulse-ticker-v1:*`, `upside-pulse-summary-v1`),
  `community-cache.ts`'s `LIST_CACHE_KEY`/`DISCOVER_CACHE_KEY`
  (`upside-communities-list-v1`, `upside-communities-discover-v1`),
  `compound-play.ts`'s `MILESTONE_ACTUALS_KEY`
  (`upside-compound-milestone-actuals-v1`), `daily-duel.ts`
  (`upside-daily-duel-v2`), `week-marks.ts` (`upside-week-marks-v1`), and
  `active-sheet.ts` (`upside-active-sheet-id`). None of these push local
  data back to a *different* user's server row the way the Lab cache did,
  so the fix above (AuthProvider purge-on-account-switch) already covers
  the exposure window for all of them — they all match the
  `upside-*`/`portfell-*`/`sb-*` prefix `purgeClientSession()` wipes. No
  further code change recommended; listed here so a future pass doesn't
  have to re-discover the same prefix sweep found them.

## Low (backlog)

- **`src/lib/market/quote-store.ts` durable cache (`portfell_quote_cache`)
  is correctly a hard 7-day TTL** (`MAX_AGE_MS`), not
  stale-while-revalidate — appropriate for a last-known-print failover
  table, not the primary cache. No change needed; noting only because the
  task asked to confirm this explicitly.
- **`marketCircuitSnapshot`/circuit breaker state is per-process
  (in-memory `Map`, `circuit-breaker.ts:54`)**, so a burst spread across
  many cold Vercel function instances each starts its own breaker
  "closed" and can each independently take a few failed requests before
  learning a provider is down. Inherent to serverless without a shared
  store; `AGENTS.md`'s documented mitigation is the multi-provider
  fallback chain, not a distributed breaker, so left as-is.

## Needs a decision

None. Both Critical findings had a fix that was unambiguous given the
existing per-owner/per-user server-side model (`portfell_lab_state`
keyed by `owner_id`, Pulse candidates carrying `auth.user.id`) — the bugs
were purely in caches that hadn't been scoped to match.

---

## Areas checked and found already correct

- **Next.js Data Cache / `fetch()`:** every page under `src/app/*` is a
  static shell (`export default function Page() { return null; }`) with
  all real content rendered client-side inside `WorkspaceShell` /
  `Dashboard` — there is no server-rendered per-user data in a page or
  layout to leak via the Route/Data Cache. No `cache: "force-cache"`
  anywhere in `src/`. The only `unstable_cache` uses
  (`seasonality-fetch.ts`, `ticker-context.ts`, `trends-cache.ts`,
  `earnings-brief.ts`, and the `/api/upside-portfolio/teaser` fund-teaser
  cache) are all genuinely shared, non-personal data — the teaser one is
  explicitly commented *"Same live mark for every signed-in viewer"* and
  is correctly still gated by `requireAuthUser()` and marked
  `Cache-Control: private` at the HTTP layer.
- **`export const dynamic` / route caching:** every route handler under
  `src/app/api/*` that reads or writes user-specific data (`holdings`,
  `lab`, `snapshots`, `book/nav-history`, `auth/me`, `account/*`,
  `billing/*`, `admin/*`, `communities/*`, `user/export`) declares
  `export const dynamic = "force-dynamic"`. The only routes without it are
  `POST`-only (`chat`, `forecast/plan`, `thesis/pulse`) — POST responses
  are never part of Next's Route Cache regardless — or genuinely public
  market data (`quotes`, `market/*`, `popular-tickers`) that intentionally
  opts into CDN caching via `publicCdnHeaders`.
- **HTTP cache headers / `next.config.ts`:** no global `Cache-Control`
  rule in `next.config.ts`'s `headers()` — only security headers,
  `X-Robots-Tag` on private paths, and the service worker's
  `no-cache, no-store, must-revalidate`. `publicCdnHeaders()`
  (`src/lib/cdn-cache.ts`) is used by exactly five routes
  (`quotes`, `popular-tickers`, `market/events`, `market/fear-greed`,
  `market/search`, `market/seasonality`) and all five return only
  ticker/market data, never anything tied to a signed-in identity.
- **Cron-populated caches degrade gracefully.** `loadStoredPopularTickers`
  (`src/lib/popular-tickers-read.ts`) returns a static fallback list, not
  an error, if this month's cron row is missing. `nav-history`'s
  `snapshotPointsForUser` (`src/app/api/book/nav-history/route.ts`)
  returns an empty `points: []` array (not an error) if the nightly
  snapshot cron hasn't produced rows yet, and further scopes every row it
  does read down to portfolios the requesting user actually owns before
  summing `navByPortfolio`.
- **Stripe/billing:** `subscriptionStatus`/`plan`/`stripe_customer_id`
  never touch `localStorage` or any client-side query cache anywhere in
  `src/` — `UpgradeNudge.tsx` and `AccountPage.tsx` both hold it in
  transient React state only, re-fetched from `/api/billing/status`
  per-mount. That route (and `checkout`/`portal`/`webhook`) are all
  `force-dynamic`, auth-gated, and never emit a public/shared
  `Cache-Control`. No caching layer reintroduces the cross-user exposure
  the Pass 2 RLS gap created.
