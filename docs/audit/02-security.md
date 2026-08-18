# Pass 2 — Security Audit

Scope: RLS policies (`supabase/migrations/`), every `src/app/api/*` route, admin
routes, input validation, service-role usage, secrets hygiene, the Stripe
webhook, auth-flow redirects, dependency CVEs, CSP/security headers, and rate
limiting. Read against `AGENTS.md`'s documented intentional behaviors first,
so those aren't re-flagged as bugs.

Branch: `claude/audit-security`, based on `origin/main` @ `8c881edf`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 1 | 1 |
| High | 0 | — |
| Medium | 5 | 0 (backlog) |
| Low | 4 | 0 (backlog) |

`npm audit` is clean (0 vulnerabilities across 971 resolved packages;
`zod@4.4.3`, `react-markdown@10.1.0`, `remark-gfm@4.0.1`, `stripe@22.5.0`,
`next@16.3.0` are all current).

---

## Critical

### 1. Any signed-in user could self-grant an active Stripe subscription

**Where:** `supabase/migrations/043_rls_grants_oracles_initplan.sql:74-78`
(`portfell_profiles_update` policy) combined with
`supabase/migrations/20260818210000_stripe_billing.sql:6-11` (the new
`stripe_customer_id` / `stripe_subscription_id` / `subscription_status` /
`plan` / `current_period_end` columns).

**What's wrong:** `portfell_profiles_update` allows any authenticated user to
`UPDATE` their own profile row (`using (id = auth.uid()) with check (id =
auth.uid())`) with no column-level restriction, and `authenticated` holds the
table-wide `UPDATE` grant (Supabase's default privilege for every new
table — migration 043 only revoked `TRUNCATE`/`REFERENCES`/`TRIGGER` from
that role, not `UPDATE`). The Stripe billing migration added five
subscription-mirror columns to that same row with no additional protection.
The webhook route's own comment says "the app never trusts client-reported
subscription state — only this webhook writes these columns"
(`src/app/api/billing/webhook/route.ts:14-16`), but nothing in the database
enforced that. Every browser already has the public Supabase anon key; a
user only needs their own session to call, from dev tools, outside the app
entirely:

```
PATCH /rest/v1/portfell_profiles?id=eq.<self>
{ "subscription_status": "active" }
```

and RLS would accept it. No route in the app itself does this (`/api/auth/me`
`PATCH` builds an explicit allow-listed patch object and never touches
billing columns — `src/app/api/auth/me/route.ts:59-92`), so the only path in
today's app that reads `subscription_status` is the "Upgrade" nudge UI
(`src/components/billing/UpgradeNudge.tsx`, `src/components/AccountPage.tsx`)
— nothing is paywalled yet. But billing is explicitly "newly added, WIP" and
the entire point of it going live is to gate something on this value; this
hole would otherwise silently carry into whatever ships next as a zero-effort
bypass, and it's exploitable by anyone today with nothing more than the
browser dev tools already open.

**Fix implemented:** `supabase/migrations/20260818223000_lock_billing_columns.sql`
adds a `BEFORE INSERT OR UPDATE` trigger,
`portfell_profiles_guard_billing_columns()`, that raises an exception if any
of the five billing-mirror columns changes (or is set on insert) unless
`auth.uid() is null` — the same "no user JWT means this is the service-role
connection" idiom the codebase already uses in `portfell_apply_cash_delta`
(migration `054_pool_indexes_lock_timeouts.sql:63-67`). A plain column-level
`REVOKE` was considered and rejected: because `authenticated` holds its
`UPDATE` grant at the *table* level, Postgres would still permit the update
through that broader grant — a trigger is the reliable way to lock down
specific columns regardless of the table-level grant. The webhook
(`src/app/api/billing/webhook/route.ts`) and, in every environment with
`SUPABASE_SERVICE_ROLE_KEY` set (which is every deployed environment per
`AGENTS.md`), the checkout/portal routes all write through the service-role
client, so no real write path changes. **Caveat:** in a hypothetical local
dev setup with `STRIPE_SECRET_KEY` configured but *no*
`SUPABASE_SERVICE_ROLE_KEY`, `/api/billing/checkout`'s write of
`stripe_customer_id` onto the user's own row would now be rejected by this
trigger (falls back to the user's own RLS-scoped session client in that
case). This is an intentional trade-off — that combination isn't how the app
is deployed anywhere — but flagging it explicitly since it wasn't testable
live in this sandbox (no Supabase project attached).

---

## High

None found. Every mutating API route checks `requireAuthUser()` (or
`requireCronAuth()` for cron, or an explicit deliberate-public rationale),
admin routes check `isSuperadminEmail()` / `userIsCommunityAdmin()` beyond
plain auth, every mutating route body is Zod-validated via `parseJsonBody()`,
and every service-role query reviewed goes through the Supabase query builder
(no raw SQL string interpolation of request input). See "Verified clean"
below for what was specifically checked.

---

## Medium (backlog — not fixed this pass)

1. **In-memory rate limiting is per-warm-instance, not distributed.**
   `src/lib/rate-limit.ts:1-11` documents this as an accepted trade-off (no
   Redis/KV yet), and the LLM-cost-sensitive endpoints (`/api/chat`,
   `/api/thesis/pulse`, `/api/forecast/plan`, `/api/book/ytd-from-image`,
   `/api/options/scan`) already layer `takeDurableRateLimit()` on top, which
   is backed by the Postgres `portfell_rate_take()` RPC
   (`supabase/migrations/20260818103608_rate_limit_and_advisor_stamp.sql`) and
   *is* cross-instance. But `checkRateLimit()`-only endpoints — `/api/feedback`,
   `/api/internal/telemetry`, `/api/internal/log-error`,
   `/api/communities/join` (peek), `/api/trends`, and the blanket
   `limitMutationRequest()` / `limitPublicMarketRequest()` IP caps in
   `src/proxy.ts` — can still be burst across multiple cold Vercel instances.
   Fix: move the durable RPC under `limitMutationRequest`/`limitPublicMarketRequest`
   too, or adopt Upstash/Vercel KV, if abuse is observed.
2. **CSP `script-src` includes `'unsafe-inline'`.**
   `src/lib/security-headers.ts:57-70` documents why (Next.js's Flight
   scripts on cached/ISR pages have no nonce, and a nonce would void
   `'unsafe-inline'` per spec anyway). This is a real widening of XSS blast
   radius versus a strict nonce-based CSP, already reasoned through and
   accepted — worth revisiting if Next.js ships a way to nonce cached Flight
   payloads.
3. **`/api/market/seasonality?force=1` lets any unauthenticated caller force
   a cache-bypassing upstream fetch.** `src/app/api/market/seasonality/route.ts:18-21`.
   Capped at 120 req/min/IP by `limitPublicMarketRequest`
   (`src/lib/rate-limit.ts:140-151`), but an IP-rotating scraper could still
   burn the free-tier market-data quota faster than the CDN cache would
   otherwise allow. Same shape as item 1 (in-memory, per-instance limiter).
4. **GDPR export's public/plaintext route has no distinct rate limit
   from the encrypted one.** `/api/account/export` and `/api/user/export`
   both sit in `TIGHT_PATHS` (`src/lib/rate-limit.ts:79-89`, 20 req/min/IP),
   which is reasonable, but a compromised session could still script 20
   full-book exports a minute; consider a slower, durable per-user limit
   here too (same `takeDurableRateLimit` pattern already used for Margus).
5. **Open (email-less) community invite links never expire and are
   reusable indefinitely** until an admin explicitly revokes them
   (`supabase/migrations/047_reusable_community_invites.sql`). This is a
   deliberate, documented product decision ("Open community links stay
   live... until the admin revokes it or sets `expires_at`"), not a bug —
   listed here only as a hardening idea: a UI nudge to set `expires_at` on
   invite creation, since a link leaked publicly (pasted in a public repo,
   forum, etc.) grants membership forever otherwise.

## Low (backlog — not fixed this pass)

1. **CSV export is not formula-injection-safe.** `src/lib/gdpr/csv.ts:2-12`
   escapes quotes/commas/newlines (RFC 4180) but not a leading `=`, `+`,
   `-`, or `@`. A malicious co-owner could set a shared sheet's `name` to a
   formula string; the *other* owner's own CSV export (`format=csv`) would
   then contain it verbatim, and Excel/Sheets would execute it on open. Low
   because it requires a shared sheet, a specific naming choice by the
   co-owner, and the victim opening their own export in spreadsheet
   software with formulas enabled. Fix: prefix cells starting with
   `=+-@` with a `'` (or a leading tab) in `csvEscape`.
2. **`/api/demo/lock` has no auth check**, relying solely on
   `NODE_ENV`/`VERCEL_ENV` not being `"production"` to 404
   (`src/app/api/demo/lock/route.ts:12-17`). Intentional (it's the local
   dev-only "freeze the demo book" tool) and already rate-limited via
   `TIGHT_PATHS`, but worth an explicit auth check too as defense-in-depth
   in case a preview deployment's env vars are ever misconfigured.
3. **GDPR encrypted export ships the AES-256-GCM unwrap key in a response
   header alongside the encrypted body in the same HTTP response**
   (`src/lib/gdpr/user-export.ts:294-303`, `X-Upside-Export-Key`). This is a
   documented, intentional "protect the file at rest if stored somewhere
   else later" pattern, not a bug — noting only because it provides no
   confidentiality benefit against anyone who can read the response itself
   (e.g., a MITM, which HTTPS already rules out; or browser extensions with
   network access).
4. **`parseJsonBody()` (`src/lib/parse-json-body.ts`) has no explicit
   request-body size cap** before `req.text()`/`JSON.parse`. Vercel's
   platform-level Serverless Function body limit (4.5 MB) is the actual
   backstop today, which is adequate, but an explicit cap close to what
   each schema actually needs (most bodies are well under 10 KB) would fail
   faster and cheaper than relying on the platform default.

---

## Needs a decision

None. Every ambiguous-looking area resolved cleanly on inspection (see
"Verified clean" below) — nothing here required guessing at intended
behavior beyond what `AGENTS.md` already documents.

---

## Verified clean (checked, no finding)

- **RLS on every migration.** All 61 files in `supabase/migrations/` read.
  `028_rls_deep_sweep_hardening.sql` (community self-insert admin-escalation
  fix, snapshot insert/delete lockdown, email-oracle RPC lockdown) and
  `043_rls_grants_oracles_initplan.sql` (anon table grants fully revoked,
  `auth.uid()`/`auth.jwt()` initplan wraps, error-log insert closed) both
  hold. Every migration after them (`044`–`054`, plus the six
  `2026081*`-timestamped ones through `stripe_billing`) either adds
  `revoke all ... from anon, public, authenticated; grant ... to
  service_role` on new service-role-only tables (`popular_tickers`,
  `quote_cache`, `community_invite_uses`, `household_groups`,
  `cash_events` — SELECT only, correctly scoped by
  `portfell_is_portfolio_co_owner`), or is a column/index/trigger addition
  that inherits the table's existing policy with no widening. No
  regression found.
- **Auth on every API route.** Every route under `src/app/api/` calls
  `requireAuthUser()`/`requireCronAuth()`, except: `/api/internal/log-error`
  (deliberately public, comment explains it exists so a render error on the
  sign-in screen — before any session exists — can still be reported;
  IP-rate-limited), `/api/internal/telemetry` (public web-vitals sink,
  IP-rate-limited, no user data), `/api/quotes` + `/api/market/*` +
  `/api/popular-tickers` (deliberately public read-only market data behind
  CDN caching + `limitPublicMarketRequest` IP caps), `/api/billing/webhook`
  (Stripe signature is the auth), and `/api/demo/lock` (dev-only, see Low
  #2). All of these are intentional per their own code comments.
- **Admin routes.** `/api/admin/overview` and `/api/admin/errors` both check
  `isSuperadminEmail(auth.user.email)` (hardcoded allowlist,
  `src/lib/auth/superadmin.ts`) after `requireAuthUser()`, not just
  "is signed in." Community-level "admin" actions (invite management, member
  role/removal, community settings, join-request approval) all check
  `userIsCommunityAdmin()`/`portfell_is_community_admin()` — verified in
  `src/app/api/communities/[id]/route.ts`,
  `.../members/[userId]/route.ts`, `.../join-request/route.ts`,
  `.../invites/route.ts`. The member-role-change route also enforces a
  "keep at least one admin" invariant on both demotion and self-removal.
- **Input validation.** 30+ mutating routes checked use `parseJsonBody()` +
  a schema from `src/lib/api-schemas.ts` (bounded array lengths, e.g.
  `holdings.max(500)`, `messages.max(40)`). The remaining mutating routes
  either take no body (`billing/checkout`, `billing/portal`,
  `auth/sign-out`, `account/delete`), a `FormData` image upload with
  explicit type/size checks (`book/ytd-from-image`, capped at 4.5 MB), or a
  raw webhook body verified by Stripe signature before any parsing.
- **Service-role query safety.** No raw SQL string interpolation of
  request-derived input found anywhere service-role clients are used —
  every query reviewed goes through the Supabase query builder
  (`.eq()`/`.in()`/`.update()`/etc., all parameterized). The one place that
  builds a dynamic SQL string, `supabase/migrations/043...sql`'s
  `format('revoke all on table public.%I from anon, public', r.tablename)`,
  uses `%I` (identifier quoting) against `pg_tables.tablename` — not
  attacker input. Mutation routes that write to shared/whole-book state
  (`/api/snapshots` restore/create) correctly gate on
  `supabaseUsesServiceRole()` and re-scope every write to
  `listOwnedPortfolioIds(auth.user.id)` before calling the service-role
  client, rather than trusting caller-supplied IDs.
- **Secrets hygiene.** `.env.example` contains only placeholders (verified
  every `=` line — `CRON_SECRET=change-me-to-a-long-random-string` is an
  example value, not a real secret in use). Every `src/app/api/cron/*` route
  calls `requireCronAuth()` (`src/lib/cron-auth.ts`), which fails closed
  (503) if `CRON_SECRET` isn't configured and does a timing-safe compare.
  No `console.*`/`logEvent()` call found that logs a key, secret, token, or
  password value.
- **Stripe webhook.** `src/app/api/billing/webhook/route.ts` reads the raw
  body via `req.text()` (not JSON-parsed first), requires the
  `stripe-signature` header, and calls `stripe.webhooks.constructEvent()`
  before touching the database or trusting anything in the payload; a bad
  or missing signature 400s immediately.
- **Auth-flow redirects.** `safeInternalPath()`
  (`src/lib/site-url.ts:127-135`) rejects anything not starting with a bare
  `/`, plus protocol-relative (`//`), backslash, and `scheme://` forms —
  used consistently by `/auth/callback`, `/auth/google`, and
  `/auth/google/callback`'s `next` parameter. `/account/join` takes no
  redirect parameter at all (hardcoded `router.replace("/")`). `/login` is
  a client-only redirect stub with no query handling.
- **Dependencies.** `npm audit` → 0 vulnerabilities (971 resolved
  packages). `zod@4.4.3`, `react-markdown@10.1.0`, `remark-gfm@4.0.1`,
  `stripe@22.5.0`, `next@16.3.0`, `react@19.2.8` all current, no known CVEs.
- **CSP / security headers.** Contrary to the audit brief's assumption that
  none might exist: `src/proxy.ts` + `src/lib/security-headers.ts` already
  set a real CSP (`default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `upgrade-insecure-requests`, Supabase origin scoped
  into `connect-src`) plus HSTS, `X-Frame-Options: DENY`, `nosniff`,
  `Cross-Origin-Opener-Policy`, and a locked-down `Permissions-Policy`, on
  every response including static files. Stripe needs **no** CSP changes:
  `/api/billing/checkout` and `/api/billing/portal` use Stripe-hosted
  Checkout/Billing Portal (`stripe.checkout.sessions.create` /
  `stripe.billingPortal.sessions.create`, both returning a `url` the
  browser is redirected to) — a full-page navigation away from the app, not
  an embedded iframe or `js.stripe.com` script, so `frame-src 'none'` and
  the current `script-src` are unaffected. (`'unsafe-inline'` on
  `script-src` is a real, pre-existing, already-documented trade-off — see
  Medium #2, not new.)
- **Rate limiting on AI-assistant endpoints.** `/api/chat`,
  `/api/thesis/pulse`, `/api/forecast/plan`, `/api/book/ytd-from-image`,
  and `/api/options/scan` all call `takeDurableRateLimit()` (per-user,
  cross-instance via the `portfell_rate_take()` Postgres RPC from
  `20260818103608_rate_limit_and_advisor_stamp.sql`) in addition to
  `requireAuthUser()`. The RPC itself is `security definer`, executable
  only by `service_role`, with input validation on key length and
  limit/window bounds.

---

## Fix applied this pass

- `supabase/migrations/20260818223000_lock_billing_columns.sql` (new) —
  see Critical #1.

## Checks run

- `npm install` (`node_modules` was missing) → clean.
- `npm audit` → 0 vulnerabilities.
- `npm run typecheck` → clean.
- `npm run lint` → clean (`--max-warnings 0`).
- `npx tsx scripts/test-invariants.ts` → 3 failures, all pre-existing and
  unrelated to this pass: `circle awards are a grid of cards, not a flat
  divided list`, `no em dashes in user-facing copy`, `Fund page labels
  Margus's note Thesis`. No new failures.
