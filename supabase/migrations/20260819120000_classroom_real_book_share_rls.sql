-- CRITICAL: portfell_community_portfolios_owner_insert let any signed-in
-- community member pin ANY portfolio they own into ANY community they
-- belong to -- including a classroom. The app route that mints these rows
-- (POST /api/communities/[id]/sheets, src/app/api/communities/[id]/sheets/route.ts)
-- already refuses to share a real sheet into a class ("This class only
-- shows the paper sheet you were given"), and shareOwnedSheetsIntoCommunity
-- (src/lib/community-share.ts) skips classrooms entirely -- but neither of
-- those is a database constraint. This app ships its Supabase URL + anon
-- key to the browser (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY,
-- src/lib/supabase/env.ts) and every signed-in user carries their own
-- session JWT, so a student could call PostgREST directly:
--   POST /rest/v1/portfell_community_portfolios
--   { "community_id": "<their class>", "portfolio_id": "<their real book>" }
-- and RLS alone would let it through -- the row-level check only verified
-- "you're a member of this community" and "you own this portfolio," with
-- no tie back to classroom_community_id. That is exactly the bypass this
-- table's own AGENTS.md rule exists to prevent ("Never share a real book
-- into a class"): a student's real holdings and cost basis would become
-- visible to their teacher and every classmate through the class's book
-- view (GET /api/communities/[id]/book), which shows real buy_price for
-- classroom communities.
--
-- Fix: for a classroom community, a pinned portfolio must be that class's
-- own paper sheet (portfolios.classroom_community_id = the community being
-- pinned into). Circles are unaffected -- they keep the existing
-- member + owner check.

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
    and (
      not exists (
        select 1
        from public.portfell_communities c
        where c.id = portfell_community_portfolios.community_id
          and c.kind = 'classroom'
      )
      or exists (
        select 1
        from public.portfell_portfolios p
        where p.id = portfell_community_portfolios.portfolio_id
          and p.classroom_community_id = portfell_community_portfolios.community_id
      )
    )
  );
