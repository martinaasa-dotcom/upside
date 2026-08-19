# Pass 2 — Security: fix log

One row per finding in [`02-security.md`](02-security.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file, `npm run test`
111/111 passing, `npm run test:invariants` back to its 2 pre-existing
failures (`circle awards…`, `Fund page labels…` — both unrelated to these
files, confirmed by a `git stash` baseline run).

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| C1 | Any signed-in user could self-grant an active Stripe subscription via an RLS gap | Critical | **Resolved** (prior session) | Migration `20260818223000_lock_billing_columns.sql`; report §Critical | Fixed when the pass was first run, merged to `main`. |
| M1 | In-memory rate limiting is per-warm-instance, not distributed | Medium | **Deferred** | — | Needs Redis/Upstash/Vercel KV — an infrastructure and cost decision, not a code fix. The LLM-cost endpoints already layer the cross-instance `takeDurableRateLimit()` on top. Item M4 below moves one more endpoint onto that durable path. |
| M2 | CSP `script-src` includes `'unsafe-inline'` | Medium | **Deferred** | — | Already reasoned through and documented at `src/lib/security-headers.ts:57-70`: Next.js's Flight scripts on cached/ISR pages have no nonce, and a nonce would void `'unsafe-inline'` per spec. Revisit if Next ships noncing for cached Flight payloads. |
| M3 | `/api/market/seasonality?force=1` let any unauthenticated caller force a cache-bypassing upstream fetch | Medium | **Resolved** | `src/app/api/market/seasonality/route.ts:19-24`. `force` is now honoured only when `getAuthUser()` returns a user; an anonymous caller's `force=1` is ignored and served from cache. | The only client that sends `force=1` is `SeasonalityPage.tsx:546` (the Lab tab's refresh button), which is behind auth already — so no real user flow changes. Public market data, `publicCdnHeaders` unchanged, no per-user content in the response. |
| M4 | GDPR export had no per-user rate limit distinct from the IP one | Medium | **Resolved** | `src/lib/gdpr/export-response.ts:19-32`. Both `/api/account/export` and `/api/user/export` funnel through `userExportResponse`, which now takes `takeDurableRateLimit("export:<uid>", 6, 10min)` and returns 429 + `Retry-After` when exhausted. | Uses the same durable Postgres-backed limiter already used for Margus (`portfell_rate_take`), so it holds across warm instances. 6 per 10 min is generous for a person downloading their own data and closes the "script 20 full-book exports a minute off a stolen session" path. |
| M5 | Open (email-less) community invite links never expire | Medium | **Deferred** | — | A deliberate, documented product decision in migration `047_reusable_community_invites.sql`, not a bug. The hardening idea (a UI nudge to set `expires_at` at creation) is a product call for Martin, not a correctness fix. |
| L1 | CSV export is not formula-injection-safe | Low | **Resolved** | `src/lib/gdpr/csv.ts:1-23`. Verified by running `csvEscape` over the real cases: `=HYPERLINK(...)` → `"'=HYPERLINK…"`, `+1+1` → `'+1+1`, `@SUM(A1)` → `'@SUM(A1)`, and critically `-7000` → `-7000` (unchanged). | Refined the report's suggested fix: the `'` guard applies to **text only**, not numbers/booleans. A blanket prefix on anything starting with `-` would have mangled every negative amount in the export (Aasad's cash is −7000), breaking round-trippability to fix a vector that only text can carry. |
| L2 | `/api/demo/lock` has no auth check, relying only on `NODE_ENV`/`VERCEL_ENV` | Low | **Resolved** | `src/app/api/demo/lock/route.ts:12-24`. `isProduction()` → `isDeployed()`, which now also refuses when `VERCEL_ENV` or `VERCEL` is set at all — so a preview deployment 404s too. | Chose a deployment guard over the report's suggested auth check: this is the local dev tool that freezes the demo book, and local demo mode has no Supabase session to authenticate against, so requiring auth would break the tool it protects. Blocking every Vercel environment closes the exact hole named (a misconfigured preview) without that cost. `scripts/test-invariants.ts:1870-1874` updated — it pinned the old function name; the assertion now checks for the wider guard. |
| L3 | Encrypted export ships the AES-256-GCM unwrap key in a response header alongside the body | Low | **Deferred** | — | Documented, intentional "protect the file at rest if it's stored somewhere else later" pattern (`src/lib/gdpr/user-export.ts:294-303`). Provides no confidentiality against someone who can already read the response, but costs nothing and isn't a defect. No change without a product decision to drop the pattern. |
| L4 | `parseJsonBody()` had no explicit request-body size cap | Low | **Resolved** | `src/lib/parse-json-body.ts:4-41`. Now refuses with 413 before parsing: `Content-Length` checked first, then the actual decoded length (a chunked body can omit or lie about the header). Default 1 MB, overridable per route via `opts.maxBytes`. | Confirmed no route needs a larger cap first: the only genuinely large upload, `/api/book/ytd-from-image`, reads `formData()` (route.ts:77), not this helper. Every `parseJsonBody` caller sends JSON well under 1 MB. |

## Deferred summary

Four items left unfixed, none silently: **M1** and **M2** need
infrastructure/framework changes rather than code (distributed rate-limit
store; Next.js nonce support), **M5** is a documented product decision,
and **L3** is a documented intentional pattern. All four are described
above with the reason.
