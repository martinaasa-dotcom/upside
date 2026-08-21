-- Close the last blanket-permit RLS policies in the schema.
--
-- `public.portfolios`, `public.holdings` and `public.covered_call_targets`
-- are the pre-`portfell_` legacy tables from migration 001. Each has
-- carried this since then:
--
--     for all using (true) with check (true)
--
-- RLS is *enabled* on all three, which is why an "is RLS on?" sweep passes
-- them -- but the attached policy permits everything to everyone. The
-- `portfell_*` equivalents (`portfell_portfolios_all`,
-- `portfell_holdings_all`, `portfell_book_snapshots_all`,
-- `portfell_lab_state_all`, `portfell_share_links_all`) were all dropped in
-- 008. These three were missed, and the later hardening passes -- 028's
-- deep sweep and 043's grants/oracles work -- never reference them, so
-- nothing has ever closed them.
--
-- Why it matters: Supabase exposes the `public` schema through PostgREST
-- and grants the `anon` role access by default, and the anon key is public
-- by design -- it ships in the browser bundle. RLS is the only thing
-- between that key and these tables. Two problems follow, and the second
-- holds even if the tables are empty:
--
--   1. Any rows still there are readable by anyone. They are the old
--      portfolios/holdings schema, so rows would be real position data.
--   2. Anyone can INSERT into a production table without limit -- storage
--      exhaustion and database cost against a product about to take
--      payments.
--
-- Both were reproduced on a local Postgres 16 against a faithful copy of
-- migration 001's schema: as `anon`, SELECT, INSERT and DELETE all
-- succeeded before this migration and all fail after it.
--
-- Nothing in the app reads or writes these tables:
--   grep -rnE 'from\("(portfolios|holdings|covered_call_targets)"\)' src/
-- returns nothing.
--
-- This deliberately does NOT drop the tables. That is destructive and
-- irreversible against data nobody has looked at yet; whether they still
-- hold anything worth keeping is the product owner's call. Revoking access
-- closes the exposure completely either way, and they can be dropped later
-- once their contents are known.
--
-- After this runs: RLS is on with no policy attached, which denies
-- everything to non-superuser roles, and the grants are revoked as a
-- second, independent layer. The service role bypasses RLS as always, so a
-- migration or an admin inspection can still read them.

do $$
declare
  target text;
  pol text;
begin
  foreach target in array array['portfolios', 'holdings', 'covered_call_targets']
  loop
    -- Tolerate a database where these were already dropped by hand.
    if to_regclass(format('public.%I', target)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', target);

    -- Drop every policy present, not just the known name from 001, so this
    -- is correct even if something was added since.
    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target
    loop
      execute format('drop policy if exists %I on public.%I', pol, target);
    end loop;

    -- Second layer, independent of RLS: PostgREST cannot reach what the
    -- role holds no grant on.
    execute format('revoke all on public.%I from anon, authenticated', target);
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.portfolios') is not null then
    comment on table public.portfolios is
      'LEGACY (pre-portfell_ rename), unused by the app. RLS policies dropped and access revoked from anon/authenticated in 20260821120000. Safe to drop once its contents are confirmed unneeded.';
  end if;
  if to_regclass('public.holdings') is not null then
    comment on table public.holdings is
      'LEGACY (pre-portfell_ rename), unused by the app. RLS policies dropped and access revoked from anon/authenticated in 20260821120000. Safe to drop once its contents are confirmed unneeded.';
  end if;
  if to_regclass('public.covered_call_targets') is not null then
    comment on table public.covered_call_targets is
      'LEGACY (pre-portfell_ rename), unused by the app. RLS policies dropped and access revoked from anon/authenticated in 20260821120000. Safe to drop once its contents are confirmed unneeded.';
  end if;
end
$$;
