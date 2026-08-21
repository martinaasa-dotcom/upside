-- Let the Sunday letter resume instead of silently dropping people.
--
-- `dispatchWeeklyLetters` walks every opted-in recipient in one request, and
-- each recipient costs an LLM call with a 22s budget inside a route whose
-- `maxDuration` is 60. Three slow ones and the platform kills the function.
-- Nothing recorded who had already been written to, so everyone after the
-- cut-off got nothing -- and the next attempt was a week away.
--
-- This column is the resume point: a run marks each recipient as it sends,
-- skips anyone already marked inside the current week, and stops cleanly
-- before the deadline. Extra Sunday cron entries then pick up the rest, and
-- re-running is harmless because the marker makes it idempotent.
--
-- Mirrors `empty_book_nudge_sent_at` (migration 046), which solved the same
-- problem for the daily nudge.

alter table public.portfell_profiles
  add column if not exists note_sunday_sent_at timestamptz;

comment on column public.portfell_profiles.note_sunday_sent_at is
  'When the Sunday letter last went out to this profile. Lets a truncated cron run resume where it stopped and makes re-runs idempotent within the week. Null means never sent.';

-- The dispatcher reads note_sunday = true and then filters on this column,
-- so extend the existing partial index rather than adding a second one.
-- CONCURRENTLY: portfell_profiles is a live table, and a plain CREATE INDEX
-- takes a lock that queues every write to it while the index builds. The
-- repo's own linter (scripts/migrate-online.ts --lint) rejects the
-- non-concurrent form, and it rejected the first version of this file.
-- The runner executes this outside a transaction, which Postgres requires.
create index concurrently if not exists portfell_profiles_note_sunday_sent_idx
  on public.portfell_profiles (note_sunday_sent_at)
  where note_sunday = true;
