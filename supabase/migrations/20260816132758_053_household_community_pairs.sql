-- Households that share a book also share circle membership.
-- Martin + Amanda (Aasad / Anu / MaryAnn) and Rasmus + Karoliine (Karud)
-- stay two people on the member list, but join / leave / role changes
-- copy across the pair. Martin's two Google logins are in the Aasad
-- group so either login sees the same circles. Classrooms stay per person.

create table if not exists public.portfell_household_groups (
  email text primary key,
  group_key text not null
);

create index if not exists portfell_household_groups_key_idx
  on public.portfell_household_groups (group_key);

comment on table public.portfell_household_groups is
  'Emails that share a household book. Circle join/leave/role copies across the group. Not an account alias: they stay separate people.';

insert into public.portfell_household_groups (email, group_key) values
  ('martin.aasa@upthink.ee', 'aasad'),
  ('aasamartinaasa@gmail.com', 'aasad'),
  ('amandalucas400@gmail.com', 'aasad'),
  ('rasmusmarjapuu@gmail.com', 'karud'),
  ('karukaroliine99@gmail.com', 'karud')
on conflict (email) do update set group_key = excluded.group_key;

alter table public.portfell_household_groups enable row level security;
revoke all on table public.portfell_household_groups from anon, public, authenticated;
grant select, insert, update, delete on table public.portfell_household_groups to service_role;

create or replace function public.portfell_mirror_household_community_member()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  src_email text;
  grp text;
  cid uuid;
  src_user uuid;
begin
  if pg_trigger_depth() > 1 then
    return coalesce(new, old);
  end if;

  cid := coalesce(new.community_id, old.community_id);
  src_user := coalesce(new.user_id, old.user_id);

  if exists (
    select 1
    from public.portfell_communities c
    where c.id = cid
      and c.kind = 'classroom'
  ) then
    return coalesce(new, old);
  end if;

  select lower(email) into src_email
  from public.portfell_profiles
  where id = src_user;
  if src_email is null then
    return coalesce(new, old);
  end if;

  select group_key into grp
  from public.portfell_household_groups
  where email = src_email;
  if grp is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    insert into public.portfell_community_members (community_id, user_id, role)
    select new.community_id, p.id, new.role
    from public.portfell_household_groups g
    join public.portfell_profiles p on lower(p.email) = g.email
    where g.group_key = grp
      and p.id <> new.user_id
    on conflict (community_id, user_id) do update
      set role = excluded.role;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.role is not distinct from old.role then
      return new;
    end if;
    update public.portfell_community_members m
    set role = new.role
    from public.portfell_household_groups g
    join public.portfell_profiles p on lower(p.email) = g.email
    where g.group_key = grp
      and p.id <> new.user_id
      and m.community_id = new.community_id
      and m.user_id = p.id;
    return new;
  end if;

  if tg_op = 'DELETE' then
    delete from public.portfell_community_members m
    using public.portfell_household_groups g
    join public.portfell_profiles p on lower(p.email) = g.email
    where g.group_key = grp
      and p.id <> old.user_id
      and m.community_id = old.community_id
      and m.user_id = p.id;
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists portfell_household_community_member_mirror
  on public.portfell_community_members;
create trigger portfell_household_community_member_mirror
  after insert or update of role or delete
  on public.portfell_community_members
  for each row
  execute function public.portfell_mirror_household_community_member();

create or replace function public.portfell_sync_household_community_memberships(
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid;
  em text;
  grp text;
begin
  uid := coalesce(auth.uid(), p_user_id);
  if auth.uid() is not null then
    uid := auth.uid();
  end if;
  if uid is null then
    return;
  end if;

  select lower(email) into em from public.portfell_profiles where id = uid;
  if em is null then
    select lower(email) into em from auth.users where id = uid;
  end if;
  if em is null then
    return;
  end if;

  select group_key into grp
  from public.portfell_household_groups
  where email = em;
  if grp is null then
    return;
  end if;

  insert into public.portfell_community_members (community_id, user_id, role)
  select
    m.community_id,
    uid,
    case when bool_or(m.role = 'admin') then 'admin' else 'member' end
  from public.portfell_household_groups g
  join public.portfell_profiles p on lower(p.email) = g.email
  join public.portfell_community_members m on m.user_id = p.id
  join public.portfell_communities c on c.id = m.community_id
  where g.group_key = grp
    and p.id <> uid
    and coalesce(c.kind, 'circle') is distinct from 'classroom'
  group by m.community_id
  on conflict (community_id, user_id) do update
    set role = case
      when portfell_community_members.role = 'admin' or excluded.role = 'admin'
      then 'admin'
      else excluded.role
    end;
end;
$$;

revoke all on function public.portfell_sync_household_community_memberships(uuid)
  from public, anon;
grant execute on function public.portfell_sync_household_community_memberships(uuid)
  to authenticated, service_role;

-- Backfill: copy current circle memberships across each household.
insert into public.portfell_community_members (community_id, user_id, role)
select
  m.community_id,
  p.id,
  case when bool_or(m.role = 'admin') then 'admin' else 'member' end
from public.portfell_community_members m
join public.portfell_profiles src on src.id = m.user_id
join public.portfell_household_groups g_src on g_src.email = lower(src.email)
join public.portfell_household_groups g_dst on g_dst.group_key = g_src.group_key
join public.portfell_profiles p on lower(p.email) = g_dst.email
join public.portfell_communities c on c.id = m.community_id
where p.id <> m.user_id
  and coalesce(c.kind, 'circle') is distinct from 'classroom'
group by m.community_id, p.id
on conflict (community_id, user_id) do update
  set role = case
    when portfell_community_members.role = 'admin' or excluded.role = 'admin'
    then 'admin'
    else excluded.role
  end;
