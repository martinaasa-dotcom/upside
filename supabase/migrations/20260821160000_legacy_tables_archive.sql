-- Finish what 20260821120000 started on the three pre-`portfell_` tables.
--
-- That migration revoked `anon`/`authenticated` access to
-- `public.portfolios`, `public.holdings` and `public.covered_call_targets`
-- and dropped their `for all using (true) with check (true)` policies. The
-- exposure is closed. What it deliberately did not do was decide the tables'
-- fate, because dropping is irreversible against rows nobody has looked at.
--
-- Dropping is still the wrong move, and for a reason that has not changed:
-- from outside production there is no way to know whether these hold real
-- position data from before the rename. But leaving three revoked tables
-- sitting in the API-exposed schema is not a good end state either -- the
-- only thing keeping them unreachable is a revoke that a future migration,
-- a `grant usage on schema public`, or a Supabase-side default could
-- silently undo.
--
-- So: move them out of reach instead of destroying them. PostgREST serves
-- the schemas it is configured to expose (`public` by default); a table in
-- `legacy_archive` is not addressable through the API at all, whatever
-- happens to grants later. That is strictly stronger than a revoke and,
-- unlike a drop, it is one statement to undo.
--
-- This also closes the second Environment-Blocked gap Pass 2 carried into
-- Pass 11 -- "whether the C1 tables hold rows" -- without needing anyone to
-- log in and look. The counts are raised as notices, so whoever applies
-- this migration reads the answer in the output:
--
--   NOTICE:  legacy_archive: portfolios has N row(s)
--
-- If those counts come back 0, the tables were empty all along, the finding
-- was an open write primitive rather than a data leak, and they can be
-- dropped whenever with `drop table legacy_archive.<name>;`. If they come
-- back non-zero, the rows are still there to inspect -- which is exactly
-- what a drop would have prevented.

create schema if not exists legacy_archive;

-- Belt and braces: the archive schema is for cold storage reachable only by
-- the service role and superusers. No API role gets so much as USAGE.
revoke all on schema legacy_archive from public;
revoke all on schema legacy_archive from anon;
revoke all on schema legacy_archive from authenticated;

-- The service role must keep reading these, or archiving instead of
-- dropping buys nothing: inspecting the rows later is the entire reason
-- they were preserved. `revoke ... from public` above strips the USAGE that
-- every role inherits through PUBLIC, service_role included, so grant it
-- back explicitly rather than depending on a Supabase-side default that the
-- revoke has just contradicted.
grant usage on schema legacy_archive to service_role;

comment on schema legacy_archive is
  'Cold storage for tables no longer used by the app. Never exposed through PostgREST. Readable by service_role for inspection. Contents are safe to drop once confirmed unneeded.';

do $$
declare
  target text;
  n bigint;
  moved integer := 0;
begin
  foreach target in array array['portfolios', 'holdings', 'covered_call_targets']
  loop
    -- Already archived by an earlier run, or never existed on this database.
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'legacy_archive: public.% not present, nothing to move', target;
      continue;
    end if;

    -- Report what is being preserved. This is the whole point of moving
    -- rather than dropping: the answer survives the migration.
    execute format('select count(*) from public.%I', target) into n;
    raise notice 'legacy_archive: % has % row(s)', target, n;

    execute format('alter table public.%I set schema legacy_archive', target);
    moved := moved + 1;
  end loop;

  raise notice 'legacy_archive: % table(s) moved out of the public schema', moved;
end
$$;

-- Read access for the service role on what was just moved. Deliberately
-- SELECT only: nothing should ever write to cold storage again.
do $$
declare
  target text;
begin
  foreach target in array array['portfolios', 'holdings', 'covered_call_targets']
  loop
    if to_regclass(format('legacy_archive.%I', target)) is null then
      continue;
    end if;
    execute format('grant select on legacy_archive.%I to service_role', target);
  end loop;
end
$$;

-- Re-state the comments on the new locations. `set schema` carries them
-- across, but they name the old situation; make them say what is true now.
do $$
declare
  target text;
begin
  foreach target in array array['portfolios', 'holdings', 'covered_call_targets']
  loop
    if to_regclass(format('legacy_archive.%I', target)) is null then
      continue;
    end if;
    execute format(
      'comment on table legacy_archive.%I is %L',
      target,
      'LEGACY (pre-portfell_ rename), unused by the app. Moved out of the public schema in 20260821160000 so PostgREST cannot address it regardless of grants. Row count at move time was raised as a NOTICE by that migration. Safe to drop once confirmed unneeded.'
    );
  end loop;
end
$$;
