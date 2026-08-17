# Disaster recovery

Nightly in-database saves (`portfell_book_snapshots`, 02:00 UTC) are not a
backup. They live in the same Postgres as the book. This pass adds a second
copy: an encrypted JSON snapshot in S3-compatible cold storage (Cloudflare
R2 or AWS S3), plus a check that Supabase still has a fresh WAL / daily
physical backup.

Nothing here changes the app UI.

## Daily job

`GET /api/cron/disaster-recovery` (03:00 UTC, same `CRON_SECRET` as the other
crons):

1. List backups from the Supabase Management API
   (`GET /v1/projects/{ref}/database/backups`). Passes when WAL-G / PITR is
   current, or when the latest completed daily backup is younger than
   `DR_BACKUP_MAX_AGE_HOURS` (default 36).
2. Capture every `portfell_portfolios` + `portfell_holdings` row (service
   role).
3. Checksum: `SUM(cash_balance) + SUM(ROUND(shares * buy_price, 2))`.
4. Encrypt the JSON with AES-256-GCM (`SNAPSHOT_ENCRYPTION_KEY`) and PUT it
   to the bucket. A sibling `.manifest.json` stores the checksum and the WAL
   check, not the holdings.

Local:

```bash
npx tsx scripts/export-cold-snapshot.ts
```

The job still captures the book if cold storage or the Management API token
are unset. Those pieces show up as warnings. A stale WAL backup or a failed
upload returns HTTP 503 so Vercel marks the cron red.

## Env

```env
# 32 bytes, 64 hex chars (or standard base64). Never commit this.
SNAPSHOT_ENCRYPTION_KEY=

# Management API personal access token (database:read / backups_read).
# https://supabase.com/dashboard/account/tokens
SUPABASE_ACCESS_TOKEN=
# Optional if NEXT_PUBLIC_SUPABASE_URL is https://<ref>.supabase.co
# SUPABASE_PROJECT_REF=uzrnybyggznpvgxgrvgl

# S3-compatible cold storage. R2 example:
DR_S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
DR_S3_REGION=auto
DR_S3_BUCKET=upside-lab-backups
DR_S3_ACCESS_KEY_ID=
DR_S3_SECRET_ACCESS_KEY=
# DR_S3_PREFIX=upside-lab/book-snapshots
# DR_BACKUP_MAX_AGE_HOURS=36
```

AWS S3: omit `DR_S3_ENDPOINT`, set `DR_S3_REGION` to the bucket region.

## Restore validator

Decrypts a snapshot, loads cash + holdings into a throwaway Postgres schema
(`dr_restore_*`), then checks the same SUM. Drops the schema in `finally`.
Never writes to `public`.

```bash
npx tsx scripts/restore-snapshot.ts --file path/to/book.json.ulenc
npx tsx scripts/restore-snapshot.ts --latest
npx tsx scripts/restore-snapshot.ts --s3-key upside-lab/book-snapshots/2026/08/17/book-....json.ulenc
npx tsx scripts/restore-snapshot.ts --live --require-sql
```

`--require-sql` needs `DATABASE_URL` and `psql`. Without it, the same math
runs in memory so CI can still prove equality. A drifted SUM exits 1.

## If production Postgres is gone

1. Create a new Upside Lab Supabase project. Keep the `portfell_*` names.
2. Apply `supabase/migrations` in order.
3. Decrypt the latest cold snapshot (`scripts/restore-snapshot.ts --latest`
   is a verifier, not a loader). Write a one-off insert from the JSON
   `payload.portfolios` / `payload.holdings` using the service role, or restore
   a Supabase dashboard backup / PITR point if the project still exists.
4. Point Vercel env at the new URL + keys. Isolation is env, not a table
   rename.

PITR restore of the live project takes the database down for the duration.
Plan that window. Cold JSON is the copy that survives a deleted project
(Supabase deletes its own backups with the project).

## What this does not replace

- Nightly `portfell_book_snapshots` (spark / in-app restore of your own sheets)
- Auth users, storage objects, Edge Config, Vercel env
- A documented restore *into* production. The validator only proves the file
  is intact. Loading it back onto live sheets is still a deliberate, owned
  action.
