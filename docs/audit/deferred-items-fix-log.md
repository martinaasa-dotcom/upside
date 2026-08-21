# Deferred items — resolved

Two findings were closed in earlier passes with the *decision* left open,
because both turned on a judgement call rather than on evidence. Martin
asked for both to be settled. This is what was decided and why, and what was
verified rather than reasoned about.

| # | Item | From | Decision | Evidence |
|---|---|---|---|---|
| D1 | Fate of the three legacy `public` tables | Pass 2 (C1) | **Archived, not dropped** | Full sequence re-run on local Postgres 16 — see below |
| D2 | Public market limiter is memory-only | Pass 2 / Pass 4 | **Shared budget, charged per dead name** | Upstream calls counted: 7 160 → 1 432 |

---

## D1 — the legacy tables: moved out of reach, not destroyed

Pass 2 revoked `anon`/`authenticated` access to `public.portfolios`,
`public.holdings` and `public.covered_call_targets` and dropped their
`for all using (true) with check (true)` policies. It deliberately stopped
short of dropping the tables, because that is irreversible against rows
nobody has inspected.

**The decision: don't drop them — move them.** The reason not to drop has
not changed; from outside production there is still no way to know whether
those tables hold real position data from before the `portfell_` rename.
But leaving three revoked tables in the API-exposed schema is a poor end
state too: the only thing keeping them unreachable is a revoke that a later
migration, a `grant usage on schema public`, or a Supabase-side default
could silently undo.

`legacy_archive` is not a schema PostgREST serves, so a table in it is not
addressable through the API **regardless of what happens to grants
afterwards**. That is strictly stronger than the revoke, and unlike a drop
it is one statement to undo.

It also closes the Environment-Blocked gap Pass 2 carried into Pass 11 —
*"whether the C1 tables hold rows"* — without anyone having to log in and
look. The migration raises the counts as notices, so whoever applies it
reads the answer in the output:

```
NOTICE:  legacy_archive: portfolios has 5 row(s)
NOTICE:  legacy_archive: holdings has 5 row(s)
NOTICE:  legacy_archive: covered_call_targets has 0 row(s)
NOTICE:  legacy_archive: 3 table(s) moved out of the public schema
```

If those come back `0` in production, the finding was an open write
primitive rather than a data leak, and the tables can be dropped whenever
with `drop table legacy_archive.<name>;`. If they come back non-zero, the
rows are still there to inspect — which is exactly what a drop would have
destroyed.

### Verified by running it, not by reading it

Same standard as Pass 2: a local Postgres 16, migration 001's real schema,
Supabase's `anon` / `authenticated` / `service_role` roles, and the whole
migration sequence in order.

**The exposure, reproduced first** (otherwise the fix proves nothing):

```
as anon, before any migration:
  select count(*) from public.portfolios   ->  5
  insert into public.portfolios ...        ->  INSERT 0 1     (6 rows now)

after 20260821120000 (Pass 2's revoke):
  select count(*) from public.portfolios   ->  ERROR: permission denied
```

**After `20260821160000_legacy_tables_archive.sql`:**

```
public schema, legacy tables remaining   ->  (none)
legacy_archive.portfolios rows           ->  5      <- nothing destroyed

anon           -> ERROR: permission denied for schema legacy_archive
authenticated  -> ERROR: permission denied for schema legacy_archive
service_role   -> 5                      <- inspection still possible
service_role INSERT -> ERROR: permission denied for table portfolios
```

Also verified:

- **Idempotent** — a second run exits 0, reports `0 table(s) moved`, and the
  5 rows are still there.
- **Safe where the tables never existed** — the `to_regclass` guard logs
  `not present, nothing to move` and continues.
- **Writes are refused even for the service role.** `grant select` only.
  Nothing should ever write to cold storage again.

**One bug this testing caught.** The first version revoked the schema from
`public`, which strips the `USAGE` that *every* role inherits — including
`service_role`. That left the archive unreadable by anyone, which would have
destroyed the entire justification for archiving instead of dropping: the
rows would have been preserved and unreachable. `grant usage on schema
legacy_archive to service_role` is explicit in the migration now, rather
than depending on a Supabase-side default that the revoke had just
contradicted.

---

## D2 — the limiter counts requests; the cost is per ticker

Pass 4 established that a quote request's cost is per **ticker**, not per
request: one unresolvable symbol walks the bare symbol plus 16 European
exchange suffixes at two calls each, measured at ~52 upstream Yahoo calls.
Pass 4 capped a single request at `MAX_TICKERS_PER_REQUEST = 120`, which
closes the single-request amplification. What it left open was that
`limitPublicMarketRequest` keeps its counts **in memory**, so on Vercel each
warm instance has its own and the real allowance is 120/min times however
many instances are up.

### Why the obvious fixes are both wrong

**Making the existing request limiter durable** would put a Postgres round
trip in front of every quote request the product serves — telling honest
callers "yes, fine" over and over, in the hot path, undoing the performance
pass. And it would still be counting the wrong unit: the damage Pass 4
measured fit inside *one* request.

**Budgeting tickers per IP** was the next idea and is worse, for a reason
specific to this product. Classrooms are a first-class feature, and a school
puts thirty students behind one NAT address. Thirty students with twenty
holdings each, refreshing, is thousands of entirely legitimate ticker
lookups from one address. A ticker budget would take the classroom offline
while barely inconveniencing an attacker, who can just use more addresses.

### What was built instead

A budget on the thing an abuser does and a classroom does not: **names that
resolve nowhere and were not already known to be dead.** Thirty students
looking up real listings spend nothing from it. A script inventing symbols
spends all of it, because every invented symbol is a fresh full-cost walk.

- `portfell_rate_take_weighted` (migration `20260821161000`) — the existing
  bucket table, with a `p_cost` argument. A **new function name**, not a
  default argument on `portfell_rate_take`: an overload differing only in
  arity leaves PostgREST resolving by argument names, which fails at
  runtime rather than at deploy. The three-argument function and all its
  callers are untouched.
- `checkRateLimit(key, limit, windowMs, cost = 1)` — the default keeps every
  existing caller behaving exactly as before. `cost: 0` peeks without
  consuming, and without creating a bucket.
- `src/lib/market/unresolved-budget.ts` — the policy: **40 dead names per
  address per 10 minutes.**

The charge is levied **after** the fetch, against work actually done, rather
than guessed at beforehand. `fetchQuotesWithFallback` now reports
`newlyUnresolvable` — the names that were not already in Pass 4's negative
cache, so each genuinely paid for a full suffix walk. A repeat ask for a
ticker already known to be dead is charged nothing, because it cost nothing.

### The peek: authoritative, and it did not need Redis

The first version of this made the peek **memory-only**, on the grounds that
an authoritative peek means a database round trip on every quote request the
product serves. That trade was real, but the residual it left was worse than
it looked, and measuring it is what settled the matter.

**The residual, measured.** Serverless spreads requests across instances,
and an instance that has never met a caller has nothing in memory to refuse
them with. Twenty requests, each inventing ten new symbols, from one address
landing on a fresh instance every time:

| peek | served | refused | served past a spent budget | upstream calls |
|---|---|---|---|---|
| memory-only | 20 | 0 | **15** | 7 160 |
| shared | 5 | 15 | **0** | 1 790 |

Fifteen of twenty requests sailed past a budget that was already spent. That
is not a limiter with a caveat; it is one an attacker can farm by doing
nothing more clever than sending requests.

**The fix, and why it costs almost nothing.** The mistake was framing the
choice as "ask per request or do not ask". The answer barely changes minute
to minute, and -- crucially -- **the verdict that must never be stale is the
refusal, which does not need the database at all**, because refusals are
written into memory and memory is consulted first. So only the *permissive*
answer is cached, and only for 60 seconds:

1. **Local memory** -- a refusal this instance already knows. Free, and
   never stale in the direction that matters.
2. **A cached shared "ok"**, good for `SHARED_OK_TTL_MS`. This is what keeps
   the hot path free.
3. **The shared bucket**, consulted only for an address this instance has
   not vouched for in the last minute.

Cost: **one round trip per address per instance per minute**, instead of one
per request. A classroom of thirty students behind one NAT address is a
single query a minute -- pinned by a test that runs 600 real-ticker lookups
and asserts exactly one round trip, at cost 0.

So this needed **no Redis and no KV**. The obvious version was unaffordable
because it asked per *request*; asking per *address per minute* is the same
guarantee at a fraction of the cost. Recorded plainly because an earlier
version of this document named Redis as the honest answer, and was wrong
about that.

Pinned by `cannot be farmed by landing on a fresh instance every request`,
which wipes both caches before each of twenty requests -- every one arriving
at a brand-new instance -- and asserts **zero** get through.

### Measured, both directions, same instrument

Twenty requests, each inventing ten brand-new symbols, from one address:

| | requests served | requests refused | upstream Yahoo calls |
|---|---|---|---|
| before | 20 | 0 | **7 160** |
| after | 4 | 16 | **1 432** |

The 20 is arbitrary. Without the budget the number grows linearly for as
long as the attacker keeps going; with it, the address is capped for the
rest of the window and the 16 refused requests cost nothing upstream.

Both changes ask the providers for **less**, not more — worth stating
explicitly against the standing rule about provider limits. Nothing here
rotates, disguises, or multiplies anything.

### Pinned by tests

`src/lib/market/unresolved-budget.test.ts` — 7 tests:

- honest traffic is **never** charged and adds no round trip (`rpcCalls` is
  empty);
- the charge is weighted by dead names found, not by request count;
- the budget is keyed by address, so one abuser cannot block a bystander;
- a refusal is remembered locally, so the next request costs no round trip;
- **a classroom of 600 real-ticker lookups from one address passes
  untouched** — the case a per-ticker budget would have broken;
- it fails **open** when the database is unreachable;
- the shared verdict wins over a fresh instance's empty memory.

## Verification

`npm run typecheck`, `npm run lint`, `npm test` — **157 tests, 33 files**,
all passing, plus `npm run test:invariants` green.

## Unable to Verify (Environment-Blocked)

Carried into Pass 11, unchanged in kind:

1. **Neither migration has run against the real database.** Both were
   verified on a local Postgres 16 reproduction.
2. **The production row counts for D1 are still unknown** — but the
   mechanism to learn them now exists and fires automatically on apply.
3. **Real multi-instance behaviour on Vercel.** The cold-instance case is
   simulated by wiping both caches between requests, which reproduces the
   mechanism faithfully but is not production traffic.
