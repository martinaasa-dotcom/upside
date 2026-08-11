-- Fix infinite recursion in portfell_community_members SELECT policy.
-- The old policy queried the same table under RLS; use a security definer helper.

create or replace function public.portfell_is_community_member(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.portfell_community_members
    where community_id = cid and user_id = auth.uid()
  );
$$;

revoke all on function public.portfell_is_community_member(uuid) from public;
grant execute on function public.portfell_is_community_member(uuid) to authenticated, anon;

drop policy if exists "portfell_community_members_select" on public.portfell_community_members;
create policy "portfell_community_members_select" on public.portfell_community_members
  for select using (public.portfell_is_community_member(community_id));

-- Align communities select with the same helper (avoids nested RLS quirks).
drop policy if exists "portfell_communities_select" on public.portfell_communities;
create policy "portfell_communities_select" on public.portfell_communities
  for select using (public.portfell_is_community_member(id));
