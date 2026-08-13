-- Deep security sweep: close a community-membership self-escalation hole,
-- lock down whole-book snapshot writes, and stop exposing internal lookup
-- tables/RPCs to direct anon/authenticated REST calls that bypass the app.

-- 1) CRITICAL: portfell_community_members allowed ANY authenticated user to
--    insert themselves into ANY community with ANY role (including admin) —
--    the with_check only verified `user_id = auth.uid()`, with no tie back
--    to the community itself. Anyone who learned/guessed a community_id
--    (e.g. from a shared URL) could self-promote to admin and, via
--    portfell_shares_community_with(), gain read access to every member's
--    portfolios. Scope self-insert to "you are the creator of this specific
--    community" — the only legitimate use (becoming first admin right after
--    creating a community).
drop policy if exists portfell_community_members_self_insert on public.portfell_community_members;
create policy portfell_community_members_self_insert
  on public.portfell_community_members
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.portfell_communities c
      where c.id = community_id and c.created_by = auth.uid()
    )
  );

-- 2) portfell_book_snapshots INSERT/DELETE were wide open (`true`) to the
--    public role — any anon or authenticated caller could wipe or spam the
--    entire backup history via a direct REST call, bypassing the app's own
--    service-role gating in /api/snapshots entirely. Match the already-locked
--    SELECT policy: superadmin only. The app's real read/write paths use the
--    service-role client, which bypasses RLS and is unaffected by this.
drop policy if exists portfell_snapshots_insert on public.portfell_book_snapshots;
create policy portfell_snapshots_insert
  on public.portfell_book_snapshots
  for insert
  with check (public.portfell_is_superadmin());

drop policy if exists portfell_snapshots_delete on public.portfell_book_snapshots;
create policy portfell_snapshots_delete
  on public.portfell_book_snapshots
  for delete
  using (public.portfell_is_superadmin());

-- 3) portfell_account_aliases was readable by anyone (anon included) via
--    direct REST, exposing the full household-alias/email map. Nothing in
--    the app queries it client-side — every read goes through server routes
--    on the service-role client (loadAliasMap), which bypasses RLS anyway.
--    Deny all direct client reads.
drop policy if exists portfell_account_aliases_select on public.portfell_account_aliases;
create policy portfell_account_aliases_select
  on public.portfell_account_aliases
  for select
  using (false);

-- 4) portfell_lookup_profile_id_by_email had no auth.uid() guard and was
--    executable by anon, making it a plain email-enumeration oracle (returns
--    a profile id or null for any email, no session required, no rate
--    limit). Require a signed-in caller and drop anon's execute grant.
--    `authenticated` keeps execute since addCoOwnerToPortfolio still calls
--    it under the caller's own session when no service-role key is set.
create or replace function public.portfell_lookup_profile_id_by_email(p_email text)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when auth.uid() is null then null
    else (
      select id from public.portfell_profiles
      where lower(email) = lower(trim(p_email))
      limit 1
    )
  end;
$$;
revoke execute on function public.portfell_lookup_profile_id_by_email(text) from anon;

-- 5) portfell_portfolios INSERT allowed owner_id IS NULL for any
--    authenticated caller. Not exploitable today (an ownerless row can't be
--    read back or claimed via RLS — inserting the first owner row itself
--    requires already being a co-owner), but it's stale: all real creation
--    now goes through the portfell_create_portfolio_for_me() security-
--    definer RPC. Tighten direct inserts to strict self-ownership.
drop policy if exists portfell_portfolios_insert on public.portfell_portfolios;
create policy portfell_portfolios_insert
  on public.portfell_portfolios
  for insert
  with check (owner_id = auth.uid());
