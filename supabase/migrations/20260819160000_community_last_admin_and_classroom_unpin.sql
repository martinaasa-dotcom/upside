-- Pass 8 M2 + L1: two self-inflicted RLS gaps recorded in
-- docs/audit/08-community-fix-log.md, folded into one migration since
-- both are cheap and the same shape of "app already enforces this, the
-- database doesn't yet."

-- M2: "keep at least one admin" is only enforced in app code
-- (src/app/api/communities/[id]/members/[userId]/route.ts), not in the
-- database. An admin calling PostgREST directly could demote or delete
-- themselves as the sole admin -- self-harm only, no other member's data
-- is exposed or altered, but it leaves a community with nobody able to
-- manage it. A trigger closes the direct-REST path the same way
-- migration 20260818223000 closed one for billing columns.
--
-- Must not fire during a community's own deletion: portfell_community_members
-- cascades from portfell_communities (on delete cascade), so deleting a
-- community deletes its last admin row too, and that must succeed. Within
-- one transaction, a later command sees the effects of an earlier one, so
-- by the time the cascade reaches this table the parent communities row is
-- already gone -- checking it still exists is what tells the two cases
-- apart.

create or replace function public.portfell_community_members_guard_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining_admins int;
  community_still_exists boolean;
begin
  if tg_op = 'DELETE' then
    if old.role <> 'admin' then
      return old;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.role <> 'admin' or new.role = 'admin' then
      return new;
    end if;
  else
    return new;
  end if;

  select exists (
    select 1 from public.portfell_communities where id = old.community_id
  ) into community_still_exists;
  if not community_still_exists then
    -- Community itself is being deleted in this same transaction; let the
    -- cascade proceed.
    return old;
  end if;

  select count(*) into remaining_admins
  from public.portfell_community_members
  where community_id = old.community_id
    and role = 'admin'
    and user_id <> old.user_id;

  if remaining_admins = 0 then
    raise exception 'Keep at least one admin';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists portfell_community_members_guard_last_admin
  on public.portfell_community_members;
create trigger portfell_community_members_guard_last_admin
  before update or delete on public.portfell_community_members
  for each row
  execute function public.portfell_community_members_guard_last_admin();

revoke all on function public.portfell_community_members_guard_last_admin()
  from public, anon, authenticated;

-- L1: portfell_community_portfolios_owner_delete (migration 043) lets any
-- portfolio owner delete their own pinned row, with no classroom check --
-- so a student could self-unpin their own classroom sheet via direct
-- PostgREST, hiding it from the class book view. Cosmetic (the trading
-- lock is keyed off portfolios.classroom_community_id directly, and
-- re-pinning is one POST /classroom-sheet away), but the fix mirrors the
-- one already applied to insert (20260819120000) and to the admin policy
-- (20260819150000): for a classroom community, only an admin can remove a
-- pinned row. Circles are unaffected -- owners keep self-delete there.

drop policy if exists portfell_community_portfolios_owner_delete
  on public.portfell_community_portfolios;
create policy portfell_community_portfolios_owner_delete
  on public.portfell_community_portfolios
  for delete
  using (
    portfell_is_community_admin(community_id)
    or (
      exists (
        select 1
        from public.portfell_portfolio_owners o
        where o.portfolio_id = portfell_community_portfolios.portfolio_id
          and o.user_id = (select auth.uid())
      )
      and not exists (
        select 1
        from public.portfell_communities c
        where c.id = portfell_community_portfolios.community_id
          and c.kind = 'classroom'
      )
    )
  );
