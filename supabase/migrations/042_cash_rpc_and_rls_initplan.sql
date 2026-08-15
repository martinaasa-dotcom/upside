-- Tighten the cash RPC and a few query-planner nits from the 2026-08
-- security/performance advisors.
--
-- 1. authenticated could hit portfell_apply_cash_delta via PostgREST. The
--    function checks co-ownership, but the app only ever calls it from API
--    routes on the service-role key. Leave execute on service_role; take it
--    off authenticated so a stolen user JWT cannot move cash over RPC.
--
-- 2. Wrap auth.uid() in (select auth.uid()) on the policies that call it
--    directly, so Postgres evaluates it once per statement instead of once
--    per row (auth_rls_initplan).
--
-- 3. Cover the unindexed foreign keys the advisor flagged.

revoke execute on function public.portfell_apply_cash_delta(uuid, numeric)
  from authenticated;

drop policy if exists portfell_lab_state_select on public.portfell_lab_state;
create policy portfell_lab_state_select
  on public.portfell_lab_state
  for select
  using (owner_id = (select auth.uid()));

drop policy if exists portfell_lab_state_write on public.portfell_lab_state;
create policy portfell_lab_state_write
  on public.portfell_lab_state
  for all
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists portfell_portfolios_insert on public.portfell_portfolios;
create policy portfell_portfolios_insert
  on public.portfell_portfolios
  for insert
  with check (owner_id = (select auth.uid()));

drop policy if exists portfell_portfolio_owners_select on public.portfell_portfolio_owners;
create policy portfell_portfolio_owners_select
  on public.portfell_portfolio_owners
  for select
  using (
    user_id = (select auth.uid())
    or portfell_is_portfolio_co_owner(portfolio_id)
    or portfell_shares_community_with(user_id)
  );

create index if not exists portfell_communities_created_by_idx
  on public.portfell_communities (created_by);

create index if not exists portfell_community_duels_user_id_idx
  on public.portfell_community_duels (user_id);

create index if not exists portfell_community_invites_created_by_idx
  on public.portfell_community_invites (created_by);

create index if not exists portfell_join_requests_decided_by_idx
  on public.portfell_community_join_requests (decided_by);

create index if not exists portfell_join_requests_user_id_idx
  on public.portfell_community_join_requests (user_id);

create index if not exists portfell_portfolio_invites_created_by_idx
  on public.portfell_portfolio_invites (created_by);
