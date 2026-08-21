# Pass 2 — Security (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `69f5348` (main, after Pass 1 closed)

> Round 2 re-derivation. Nothing in the prior `02-security-fix-log.md` was
> carried over as fact; every check below was re-run against the current
> source. Where a prior "Resolved" survived re-testing it is re-confirmed
> with fresh evidence.

**Headline:** one real hole, and it is in the oldest migration in the repo.
Three legacy tables have carried `for all using (true) with check (true)`
since migration 001 and **no migration has ever dropped those policies** —
including the two hardening passes (`028`, `043`) this brief names, which
skip those tables entirely. Everything else in this pass came back clean,
several of them notably well-built.

## Environment limits, stated up front

This sandbox has **no production database access and no outbound egress**,
so nothing here is verified by executing a query against the live schema.
Every finding is derived from the migration history, which is the source of
truth for what was applied. Two consequences, both honest rather than
hedged:

- **Finding C1's severity depends on data I cannot see.** The exposure is
  certain from the migrations; whether those tables still *hold rows* is
  not. It is graded on the assumption they might.
- **No "attempt the exploit from a non-owner session" testing was
  possible** — the brief asks for it, and it did not happen. Marked
  **Unable to Verify (Environment-Blocked)** where relevant and carried
  into Pass 11.

---

## Findings

### C1 — Critical: three legacy tables are world-readable and world-writable

*Files:* `supabase/migrations/001_portfell_schema.sql:54-56`

```sql
create policy "portfolios_all"  on public.portfolios            for all using (true) with check (true);
create policy "holdings_all"    on public.holdings              for all using (true) with check (true);
create policy "cc_targets_all"  on public.covered_call_targets  for all using (true) with check (true);
```

RLS is enabled on all three, which is why an "is RLS on?" sweep passes them
— but the policy attached permits everything to everyone.

**These are never dropped.** Verified by searching every migration for a
matching `drop policy`:

```
$ for p in portfolios_all holdings_all cc_targets_all; do
    grep -rl "drop policy if exists \"$p\"" supabase/migrations/*.sql; done
(no output)
```

Contrast the `portfell_*` equivalents, which *were* cleaned up properly —
`portfell_portfolios_all`, `portfell_holdings_all`,
`portfell_book_snapshots_all`, `portfell_lab_state_all` and
`portfell_share_links_all` are each dropped in `008`, some twice. The
hardening only ever covered the prefixed tables.

**The two hardening migrations do not touch them either:**

```
$ grep -nE "public\.(portfolios|holdings|covered_call_targets)\b" \
    supabase/migrations/028*.sql supabase/migrations/043*.sql
(no output)

$ grep -rnE "revoke .*(portfolios|holdings|covered_call_targets)" \
    supabase/migrations/*.sql | grep -v portfell
(no output)
```

No `drop table` either — only `013` drops anything, and that is
`portfell_share_links`.

**Why this is reachable.** Supabase exposes the `public` schema through
PostgREST and grants the `anon` role access to it by default. The anon key
is public by design — it ships in the browser bundle of every page. RLS is
the only thing standing between that key and these tables, and for these
three it permits everything.

**Impact.** Two separate problems, and the second holds even if the tables
are empty:

1. **Read/exfiltration** — if these legacy tables still hold rows from
   before the `portfell_` rename, anyone can select them. They are the old
   portfolios/holdings schema, so any rows are real position data.
2. **Unauthenticated write primitive** — anyone can `insert` into a
   production table without limit. That is storage exhaustion and a
   database-cost vector against a product about to take payments, and it
   needs no data present to be worth fixing.

**The app never touches them**, which is what makes this safe to close:

```
$ grep -rnE 'from\("(portfolios|holdings|covered_call_targets)"\)' src/
(no output)
```

*Severity:* **Critical** if any rows remain, **High** if empty. Graded
Critical because it cannot be checked from here and the safe assumption is
the worse one.

*Fix:* revoke access without destroying data — see the fix log. Dropping
the tables would be the tidier end state but is destructive and is Martin's
call, not something to do blind against production.

### M1 — Medium: `portfolios/join` has no rate limit, its sibling does

*Files:* `src/app/api/portfolios/join/route.ts` vs
`src/app/api/communities/join/route.ts:37`

`communities/join` throttles invite lookups by IP
(`takeDurableRateLimit('invite-peek:'+ip, 30, 5min)`). The portfolio
equivalent, which resolves an invite token the same way, has none.

**Graded Medium, not High, and the reason matters.** Invite tokens are
`randomBytes(18)` — 144 bits — so brute-forcing one is not feasible no
matter how fast you are allowed to ask. This is not an enumeration hole.
What remains is defence-in-depth and an unmetered database round-trip per
request, plus a plain inconsistency between two routes that do the same
job. Worth closing; not worth alarm.

---

## What passed, with evidence

Recorded so a future round does not have to re-derive it from nothing.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | RLS enabled on every table | **Pass** | 28 tables created, 30 `enable row level security` statements; set difference is empty |
| 1 | Policy clauses correct | **One failure (C1)** | All `portfell_*` blanket policies dropped in `008`; only the three unprefixed legacy ones survive |
| 2 | Every API route authenticated or deliberately public | **Pass** | All 59 routes mapped. 8 unauthenticated, each deliberate: `demo/lock` (404s on any deployment — `NODE_ENV`/`VERCEL_ENV`/`VERCEL` check), `internal/telemetry` (rate-limited + schema-validated), 5 market read endpoints, `popular-tickers` |
| 2 | — false alarm worth recording | **Pass** | `account/export` and `user/export` look unauthenticated at file level; both call `userExportResponse`, which does `requireAuthUser` at `export-response.ts:16`. A file-level grep alone would have reported a critical data-exposure bug that does not exist |
| 3 | Admin routes check a role, not just auth | **Pass** | `admin/errors` and `admin/overview` both `requireAuthUser` **and** `isSuperadminEmail` |
| 4 | Mutating routes validate against a schema | **Pass** | Every route reading a body uses `parseJsonBody` + a Zod schema. The ones without are genuinely bodiless; `book/ytd-from-image` uses `formData` with size and MIME checks |
| 5 | No SQL injection via service role | **Pass** | Every `.rpc()` call passes named parameters. No template interpolation into queries anywhere in `src/` |
| 6 | Secrets hygiene | **Pass** | `.env.example` holds placeholders only. All 7 cron routes call `requireCronAuth`. No key/secret/token reaches `logEvent` |
| 7 | Stripe webhook signature | **Pass** | `webhook/route.ts:31-47` — 400s on a missing signature, `constructEvent` verifies, bad signatures logged and rejected |
| 8 | Open redirects | **Pass** | Every redirect target is `new URL(next, origin)` with `next` through `safeInternalPath` (`site-url.ts:127`), which rejects anything not starting `/`, plus `//`, `/\`, backslashes and `://` |
| 9 | Dependency CVEs | **Pass** | `npm audit` and `npm audit --omit=dev`: **0 vulnerabilities** |
| 9 | Markdown XSS | **Pass** | No `rehype-raw`, no `dangerouslySetInnerHTML` anywhere in `src/`. `react-markdown` escapes HTML by default, so the usual vector is closed |
| 10 | CSP and security headers | **Pass** | Full CSP in `security-headers.ts` — `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`. Static set adds HSTS w/ preload, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy. `'unsafe-inline'` in `script-src` is documented and load-bearing (ISR-cached Flight scripts cannot carry a per-request nonce) |
| 10 | Stripe domains in CSP | **Not needed** | Checkout is a redirect (`window.location.href = data.url`), not an embedded iframe, so `frame-src 'none'` is correct rather than a gap |
| 11 | Rate limiting on the abuse/cost targets | **Pass** | `/api/chat` limited, as are every other provider-cost route: `forecast/plan`, `thesis/pulse`, `trends`, `options/scan`, `book/ytd-from-image`, `feedback`, `communities/join`, `internal/*`. This is the check Pass 4 item 9 depends on |

---

## Deliberately not changed

> **Corrected in Pass 4 — this bullet's premise is wrong.** These endpoints
> *are* throttled: `limitPublicMarketRequest` runs in `src/proxy.ts:47`.
> This pass looked in the route files and in `middleware.ts`, which Next 16
> renamed to `proxy.ts`. The genuine weakness — that the limiter counts
> requests while cost is per ticker, and counts in memory — is recorded and
> fixed in `deferred-items-fix-log.md` (D2). Left in place rather than
> deleted, because a withdrawn finding is worth more than a silent edit.

- **Public market endpoints are unthrottled** (`quotes`, `market/search`,
  `market/events`, `market/fear-greed`, `market/seasonality`,
  `popular-tickers`). A stranger can drive upstream provider calls without
  signing in. CDN headers blunt repeats, but varying the ticker forces
  misses. This is **Pass 4's** territory — it owns the caching strategy and
  the "make the cache the primary read path" fix that removes the incentive
  entirely — and fixing it here would mean patching the same code twice
  from two passes, which the brief explicitly warns against. Recorded here
  so Pass 4 inherits it as a known input rather than rediscovering it.

## Unable to Verify (Environment-Blocked)

Carried into Pass 11 as gaps, not passes:

1. **No live RLS testing against a real non-owner session.** The brief asks
   for attempted exploitation, not policy reading. Everything above is
   derived from migration history.
2. **Whether the C1 tables hold rows** — determines whether that finding is
   a data exposure or "only" an open write primitive. *Mechanism added:*
   migration `20260821160000` raises each table's row count as a NOTICE when
   it runs, so applying it answers this without anyone inspecting by hand.
3. **Stripe webhook replay/idempotency behaviour end to end** — signature
   verification is confirmed by reading; the live test-mode flow is Pass 6.
