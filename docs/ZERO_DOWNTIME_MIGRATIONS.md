# Zero-downtime schema migrations

Live traffic hits `portfell_portfolios` and `portfell_holdings` on every
sheet load. A migration that takes ACCESS EXCLUSIVE for more than a
heartbeat will queue those queries. Follow expand/contract, keep locks
short, and lint before you apply.

## Pipeline

```bash
# 1. Write the SQL under supabase/migrations/ (use supabase migration new)
# 2. Lint lock hazards
npx tsx scripts/migrate-online.ts --lint supabase/migrations/054_your_change.sql

# 3. Apply against a branch / staging DATABASE_URL first
DATABASE_URL=... npx tsx scripts/migrate-online.ts --apply supabase/migrations/054_your_change.sql

# 4. Same command against production DATABASE_URL once the app build that
#    reads the new shape is already live (or the change is additive).
```

`--apply` sets `lock_timeout = 2s` and `statement_timeout = 30s` (override
with `DR_LOCK_TIMEOUT` / `DR_STATEMENT_TIMEOUT`). A lock timeout retries
with backoff instead of waiting behind a long report query. `CREATE INDEX
CONCURRENTLY` is run outside a transaction, which Postgres requires.

`--force` applies even when the linter reports errors. That is a
maintenance-window flag, not a default.

## Expand / contract

Never change a live column's meaning in the same deploy as the app.

1. **Expand.** Add a nullable column, a new table, or a new function. Ship
   the app that writes both old and new shapes.
2. **Backfill.** `UPDATE ... WHERE new_col IS NULL LIMIT 1000` in a loop.
   Each batch should finish under `statement_timeout`.
3. **Contract.** Ship the app that reads only the new shape. Next
   migration: `SET NOT NULL` (short lock, table already filled) or
   `DROP COLUMN` once no running build selects the old name.

Renames follow the same pattern: add the new name, dual-write, drop the
old. Do not `RENAME COLUMN` on a hot table.

## What is safe on Postgres 15 (Supabase)

- `ADD COLUMN` nullable, or with a constant `DEFAULT` (no table rewrite)
- `CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`
- `ADD CONSTRAINT ... NOT VALID` then `VALIDATE CONSTRAINT` (ShareUpdateExclusive)
- `CREATE OR REPLACE FUNCTION`
- `CREATE TABLE` / `CREATE SCHEMA`
- RLS policy changes that do not rewrite rows

## What is not

- `ALTER COLUMN ... TYPE` (rewrite)
- `ADD COLUMN ... NOT NULL` with no default (full scan + exclusive lock)
- `CREATE INDEX` without `CONCURRENTLY` on a table that already has rows
- `VACUUM FULL`, `REINDEX` without `CONCURRENTLY`, `TRUNCATE`
- `ADD FOREIGN KEY` / `CHECK` without `NOT VALID` on a large table

The linter (`src/lib/dr/migration-locks.ts`) flags those. Indexes created
in the same file as their `CREATE TABLE` are allowed without CONCURRENTLY:
the table is empty and the exclusive lock is cheap.

## App deploys

Vercel ships the Next.js build independently of `supabase db push`. Order:

1. Additive SQL (expand) against production
2. App deploy that uses the new columns
3. Backfill
4. Tightening SQL (NOT NULL / drop) only after every live instance is on
   the new build

Do not put a breaking SQL file and a breaking app change in the same
git push unless the SQL is purely additive.

## PITR note

A failed migration is not undone by reverting git. Restore a WAL-G point
only when the SQL left the database half-migrated and you cannot roll
forward. That restore takes the project down. Prefer a forward fix.
