-- Module 2: close PostgREST oracles, strip anon table grants, finish
-- auth_rls_initplan, and stop open error-log inserts.
--
-- Helper predicates used inside RLS (is_co_owner, can_read, …) stay
-- executable by authenticated. Postgres evaluates those as the requesting
-- role, so revoking them would lock every sheet. They return booleans,
-- not rows. The functions below returned emails, user ids, or the full
-- admin dump to any signed-in JWT over /rest/v1/rpc.

revoke execute on function public.portfell_lookup_profile_id_by_email(text)
  from authenticated, anon, public;
revoke execute on function public.portfell_primary_email(text)
  from authenticated, anon, public;
revoke execute on function public.portfell_superadmin_overview()
  from authenticated, anon, public;

grant execute on function public.portfell_lookup_profile_id_by_email(text)
  to service_role;
grant execute on function public.portfell_primary_email(text)
  to service_role;
grant execute on function public.portfell_superadmin_overview()
  to service_role;

-- Anon had GRANT ALL, including TRUNCATE, which RLS cannot see.
-- The app never queries tables as anon (Google SSO + service role).
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'portfell_%'
  loop
    execute format(
      'revoke all on table public.%I from anon, public',
      r.tablename
    );
    execute format(
      'revoke truncate, references, trigger on table public.%I from authenticated',
      r.tablename
    );
  end loop;
end $$;

alter default privileges in schema public
  revoke all on tables from anon, public;

-- App writes errors via service role (bypasses RLS). WITH CHECK (true)
-- let anyone with the anon or user JWT flood the table over PostgREST.
drop policy if exists portfell_error_log_insert on public.portfell_error_log;
create policy portfell_error_log_insert
  on public.portfell_error_log
  for insert
  with check (false);

-- Remaining auth.uid() / auth.jwt() initplan wraps.

drop policy if exists portfell_profiles_select on public.portfell_profiles;
create policy portfell_profiles_select
  on public.portfell_profiles
  for select
  using (
    id = (select auth.uid())
    or portfell_shares_community_with(id)
  );

drop policy if exists portfell_profiles_upsert_self on public.portfell_profiles;
create policy portfell_profiles_insert
  on public.portfell_profiles
  for insert
  with check (id = (select auth.uid()));
create policy portfell_profiles_update
  on public.portfell_profiles
  for update
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy portfell_profiles_delete
  on public.portfell_profiles
  for delete
  using (id = (select auth.uid()));

drop policy if exists portfell_communities_insert on public.portfell_communities;
create policy portfell_communities_insert
  on public.portfell_communities
  for insert
  with check (created_by = (select auth.uid()));

drop policy if exists portfell_community_invites_select
  on public.portfell_community_invites;
create policy portfell_community_invites_select
  on public.portfell_community_invites
  for select
  using (
    portfell_is_community_admin(community_id)
    or (
      email is not null
      and (select auth.jwt() ->> 'email') is not null
      and lower(email) = lower((select auth.jwt() ->> 'email'))
    )
  );

drop policy if exists portfell_portfolio_invites_select
  on public.portfell_portfolio_invites;
create policy portfell_portfolio_invites_select
  on public.portfell_portfolio_invites
  for select
  using (
    portfell_is_portfolio_co_owner(portfolio_id)
    or (
      email is not null
      and (select auth.jwt() ->> 'email') is not null
      and lower(email) = lower((select auth.jwt() ->> 'email'))
    )
  );

drop policy if exists portfell_portfolio_invites_write
  on public.portfell_portfolio_invites;
create policy portfell_portfolio_invites_insert
  on public.portfell_portfolio_invites
  for insert
  with check (portfell_is_portfolio_co_owner(portfolio_id));
create policy portfell_portfolio_invites_update
  on public.portfell_portfolio_invites
  for update
  using (portfell_is_portfolio_co_owner(portfolio_id))
  with check (portfell_is_portfolio_co_owner(portfolio_id));
create policy portfell_portfolio_invites_delete
  on public.portfell_portfolio_invites
  for delete
  using (portfell_is_portfolio_co_owner(portfolio_id));

drop policy if exists portfell_lab_state_write on public.portfell_lab_state;
create policy portfell_lab_state_insert
  on public.portfell_lab_state
  for insert
  with check (owner_id = (select auth.uid()));
create policy portfell_lab_state_update
  on public.portfell_lab_state
  for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy portfell_lab_state_delete
  on public.portfell_lab_state
  for delete
  using (owner_id = (select auth.uid()));

drop policy if exists portfell_margus_fund_select
  on public.portfell_margus_fund;
create policy portfell_margus_fund_select
  on public.portfell_margus_fund
  for select
  using ((select auth.uid()) is not null);

drop policy if exists portfell_margus_fund_holdings_select
  on public.portfell_margus_fund_holdings;
create policy portfell_margus_fund_holdings_select
  on public.portfell_margus_fund_holdings
  for select
  using ((select auth.uid()) is not null);

drop policy if exists portfell_margus_fund_reports_select
  on public.portfell_margus_fund_reports;
create policy portfell_margus_fund_reports_select
  on public.portfell_margus_fund_reports
  for select
  using ((select auth.uid()) is not null);

drop policy if exists portfell_margus_fund_weekly_recaps_select
  on public.portfell_margus_fund_weekly_recaps;
create policy portfell_margus_fund_weekly_recaps_select
  on public.portfell_margus_fund_weekly_recaps
  for select
  using ((select auth.uid()) is not null);

drop policy if exists portfell_community_members_self_insert
  on public.portfell_community_members;
create policy portfell_community_members_self_insert
  on public.portfell_community_members
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.portfell_communities c
      where c.id = portfell_community_members.community_id
        and c.created_by = (select auth.uid())
    )
  );

drop policy if exists portfell_join_requests_select
  on public.portfell_community_join_requests;
create policy portfell_join_requests_select
  on public.portfell_community_join_requests
  for select
  using (
    user_id = (select auth.uid())
    or portfell_is_community_admin(community_id)
  );

drop policy if exists portfell_join_requests_insert
  on public.portfell_community_join_requests;
create policy portfell_join_requests_insert
  on public.portfell_community_join_requests
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.portfell_communities c
      where c.id = portfell_community_join_requests.community_id
        and c.visibility = 'public'
    )
  );

drop policy if exists portfell_join_requests_requester_update
  on public.portfell_community_join_requests;
create policy portfell_join_requests_requester_update
  on public.portfell_community_join_requests
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and status = 'pending'
  );

drop policy if exists portfell_join_requests_delete
  on public.portfell_community_join_requests;
create policy portfell_join_requests_delete
  on public.portfell_community_join_requests
  for delete
  using (
    user_id = (select auth.uid())
    or portfell_is_community_admin(community_id)
  );

drop policy if exists portfell_community_duels_insert
  on public.portfell_community_duels;
create policy portfell_community_duels_insert
  on public.portfell_community_duels
  for insert
  with check (
    user_id = (select auth.uid())
    and portfell_is_community_member(community_id)
  );

drop policy if exists portfell_community_portfolios_owner_insert
  on public.portfell_community_portfolios;
create policy portfell_community_portfolios_owner_insert
  on public.portfell_community_portfolios
  for insert
  with check (
    portfell_is_community_member(community_id)
    and exists (
      select 1
      from public.portfell_portfolio_owners o
      where o.portfolio_id = portfell_community_portfolios.portfolio_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists portfell_community_portfolios_owner_delete
  on public.portfell_community_portfolios;
create policy portfell_community_portfolios_owner_delete
  on public.portfell_community_portfolios
  for delete
  using (
    portfell_is_community_admin(community_id)
    or exists (
      select 1
      from public.portfell_portfolio_owners o
      where o.portfolio_id = portfell_community_portfolios.portfolio_id
        and o.user_id = (select auth.uid())
    )
  );
