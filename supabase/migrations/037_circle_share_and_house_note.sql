-- Circle: opt-in sheet sharing + admin house note.
-- Sharing reuses portfell_community_portfolios. Until now every owned
-- sheet dumped into the circle. After this, only rows in that table
-- are visible. Existing member sheets are backfilled so current circles
-- do not go blank. New sheets stay private until the owner shares them.

alter table public.portfell_communities
  add column if not exists house_note text;

comment on column public.portfell_communities.house_note is
  'Admin-written mandate. Shown in the circle, and on discover if public.';

drop policy if exists "portfell_community_portfolios_owner_insert"
  on public.portfell_community_portfolios;
create policy "portfell_community_portfolios_owner_insert"
  on public.portfell_community_portfolios
  for insert
  to authenticated
  with check (
    public.portfell_is_community_member(community_id)
    and exists (
      select 1
      from public.portfell_portfolio_owners o
      where o.portfolio_id = portfell_community_portfolios.portfolio_id
        and o.user_id = auth.uid()
    )
  );

drop policy if exists "portfell_community_portfolios_owner_delete"
  on public.portfell_community_portfolios;
create policy "portfell_community_portfolios_owner_delete"
  on public.portfell_community_portfolios
  for delete
  to authenticated
  using (
    public.portfell_is_community_admin(community_id)
    or exists (
      select 1
      from public.portfell_portfolio_owners o
      where o.portfolio_id = portfell_community_portfolios.portfolio_id
        and o.user_id = auth.uid()
    )
  );

insert into public.portfell_community_portfolios (community_id, portfolio_id, label)
select distinct cm.community_id, po.portfolio_id, p.name
from public.portfell_community_members cm
join public.portfell_portfolio_owners po on po.user_id = cm.user_id
join public.portfell_portfolios p on p.id = po.portfolio_id
on conflict do nothing;
