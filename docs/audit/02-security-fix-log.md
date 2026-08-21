# Pass 2 — Security fix log (Round 2)

Companion to `docs/audit/02-security.md`. One row per finding.
**No row is Resolved without fresh re-verification by the method that
surfaced it.**

| # | Finding | Severity | Status | Attempts | Evidence |
|---|---|---|---|---|---|
| C1 | Legacy `public.portfolios` / `holdings` / `covered_call_targets` world-readable and world-writable via the anon key | ~~Critical~~ → **Low** | **Resolved** | 1 | Exploit reproduced and blocked on a local Postgres 16. **Corrected 2026-08-21: the tables do not exist in production** (`information_schema` returns 0), so this was never exploitable there — only in an environment built by replaying migration 001 |
| M1 | `portfolios/join` had no rate limit while `communities/join` does | Medium | **Resolved** | 1 | `grep -c takeDurableRateLimit src/app/api/portfolios/join/route.ts` → 2 (was 0) |

## C1 — verified by running the attack, not by reading the policy

The brief asks for attempted exploitation rather than policy reading. There
is no production access here, so the schema was rebuilt locally: a faithful
copy of migration 001's three tables, their `for all using (true) with check
(true)` policies, the default Supabase `anon`/`authenticated` grants, and
one row of data standing in for legacy content.

**Before the migration, as `anon`:**

```
-- read:    select count(*) from public.portfolios;  ->  1
-- write:   insert into public.portfolios ...        ->  succeeded (2 rows)
-- delete:  delete from public.holdings;             ->  succeeded
```

All three worked. That is the finding, executed.

**After running `20260821120000_revoke_legacy_public_tables.sql`, same
session, same statements:**

```
select ... from public.portfolios   ->  ERROR: permission denied for table portfolios
insert into public.portfolios ...   ->  ERROR: permission denied for table portfolios
delete from public.holdings         ->  ERROR: permission denied for table holdings

legacy_policies remaining: 0
anon/authenticated grants: 0
rows_still_present:        2   <- nothing destroyed
```

Also verified:

- **Idempotent** — re-running the migration on the already-fixed database
  exits 0.
- **Safe where the tables never existed** — running it against a fresh
  database with none of them exits 0 (`to_regclass` guard).
- **Non-destructive** — the seeded row survives. The migration revokes
  access; it does not drop tables.

> **Decided 2026-08-21 — see `deferred-decisions.md`.** Migration `001` is
> left untouched. Editing applied SQL is what this repo's own migration doc
> warns against, and the chain already heals itself: replayed end to end,
> `001` opens the hole and the revoke plus archive close it, leaving a fresh
> environment safe with its seed rows preserved. The only window where the
> tables are reachable is during the migration run itself.

**Deliberately left for Martin:** whether to drop these three tables
outright. That is the tidier end state, but it is irreversible against data
nobody has inspected, and the exposure is fully closed without it. Each
table now carries a `comment` saying it is legacy, unused, revoked, and safe
to drop once its contents are confirmed unneeded.

> **Settled — see `deferred-items-fix-log.md` (D1).** Decision: archive
> rather than drop. Migration `20260821160000` moves all three into a
> `legacy_archive` schema, which PostgREST does not serve at all, so they
> are unreachable regardless of what happens to grants later. Nothing is
> destroyed, `service_role` keeps SELECT for inspection, and the migration
> raises each table's row count as a NOTICE — which also closes gap 2 below.

## M1 — closed for the right reason

A limiter keyed by user id, matching `communities/join`'s shape (30 per 5
minutes). Recorded honestly in the report: this is **not** an enumeration
fix. Invite tokens are `randomBytes(18)` — 144 bits — so no request rate
gets near guessing one. It closes an unmetered database round-trip per
attempt and an inconsistency between two routes doing the same job.

## Unable to Verify (Environment-Blocked)

Carried into Pass 11 as gaps, not passes:

> **Update 2026-08-21.** Both migrations have now been applied to
> production, and gap 2 below is answered: the tables are not there. The
> revoke and archive are permanent no-ops on that database, which is the
> correct end state rather than a wasted change — they still protect any
> environment rebuilt from migration 001.

1. **Live RLS testing against a real non-owner Supabase session.** C1 was
   proven on a local Postgres reproduction, which validates the migration
   and the exploit mechanics but is not the production database.
2. ~~**Whether the C1 tables hold rows in production.**~~ **RESOLVED:** they
   do not exist in production. Neither a data exposure nor an open write
   primitive *there*; both remain true of any database built by replaying
   migration 001.
3. **Stripe webhook replay/idempotency end to end** — signature
   verification confirmed by reading; the live test-mode flow belongs to
   Pass 6.

## Handed to Pass 4, not fixed here

> **Correction (Pass 4).** "Unthrottled" is wrong. `limitPublicMarketRequest`
> is wired up in `src/proxy.ts:47`; this pass checked the route files and
> `middleware.ts`, and Next 16 renamed middleware to `proxy.ts`. The real
> weakness was different and is recorded in `deferred-items-fix-log.md`
> (D2): the limiter counts *requests* while the cost is per *ticker*, and it
> keeps its counts in memory. Both are now addressed.

Public market endpoints (`quotes`, `market/*`, `popular-tickers`) are
unauthenticated and unthrottled, so a stranger can drive upstream provider
calls. Pass 4 owns the caching strategy that removes the incentive
entirely; patching the same code from two passes is what the brief warns
against. Recorded so Pass 4 inherits it rather than rediscovering it.
