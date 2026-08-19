-- Sibling of 20260819120000_classroom_real_book_share_rls.sql, found while
-- verifying that one in production.
--
-- That migration closed the student path: portfell_community_portfolios_owner_insert
-- no longer lets someone pin a real book into a classroom. But RLS policies
-- are permissive and OR'd together, and portfell_community_portfolios_admin
-- (migration 016) is:
--
--   for all using (portfell_is_community_admin(community_id))
--        with check (portfell_is_community_admin(community_id))
--
-- No ownership check, no classroom check. So for anyone who is an admin of
-- the community, that policy grants exactly what the other one denies --
-- meaning AGENTS.md's "Never share a real book into a class" was enforced
-- against students but not against the class's own teacher.
--
-- Smaller in practice than the student hole: a teacher pinning their *own*
-- real book into their own class is self-inflicted, and pinning a student's
-- would need that portfolio's uuid, which the other policies don't expose.
-- But the guarantee should hold for everyone, not just for students.
--
-- Fix: same classroom clause, on the admin policy's `with check` only.
--   - `using` is deliberately left permissive, so an admin can still read
--     and *remove* a wrongly-pinned row. Constraining it would take away
--     the way out of a bad state.
--   - Circles are untouched: `not exists (... kind = 'classroom')` is true
--     for them, so the whole clause short-circuits and circle admins keep
--     the full control they have today.

drop policy if exists "portfell_community_portfolios_admin"
  on public.portfell_community_portfolios;

create policy "portfell_community_portfolios_admin"
  on public.portfell_community_portfolios
  for all
  using (public.portfell_is_community_admin(community_id))
  with check (
    public.portfell_is_community_admin(community_id)
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
