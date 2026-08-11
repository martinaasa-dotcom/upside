-- Identity aliases (multiple Google emails = one person in communities)
-- + community-pinned sheets (Karud / Lap visible before owners sign in)

create table if not exists public.portfell_account_aliases (
  alias_email text primary key,
  primary_email text not null,
  created_at timestamptz not null default now(),
  constraint portfell_account_aliases_emails_lower
    check (
      alias_email = lower(alias_email)
      and primary_email = lower(primary_email)
    ),
  constraint portfell_account_aliases_not_self
    check (alias_email <> primary_email)
);

create index if not exists portfell_account_aliases_primary_idx
  on public.portfell_account_aliases (primary_email);

alter table public.portfell_account_aliases enable row level security;

drop policy if exists "portfell_account_aliases_select" on public.portfell_account_aliases;
create policy "portfell_account_aliases_select" on public.portfell_account_aliases
  for select using (true);

insert into public.portfell_account_aliases (alias_email, primary_email) values
  ('aasamartinaasa@gmail.com', 'martin.aasa@upthink.ee')
on conflict (alias_email) do update set primary_email = excluded.primary_email;

create or replace function public.portfell_primary_email(em text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select a.primary_email
      from public.portfell_account_aliases a
      where a.alias_email = lower(trim(em))
    ),
    lower(trim(em))
  );
$$;

revoke all on function public.portfell_primary_email(text) from public;
grant execute on function public.portfell_primary_email(text) to authenticated, anon;

-- Sheets pinned into a community (read-only for members even with no owner yet)
create table if not exists public.portfell_community_portfolios (
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  primary key (community_id, portfolio_id)
);

create index if not exists portfell_community_portfolios_portfolio_idx
  on public.portfell_community_portfolios (portfolio_id);

alter table public.portfell_community_portfolios enable row level security;

drop policy if exists "portfell_community_portfolios_select" on public.portfell_community_portfolios;
create policy "portfell_community_portfolios_select" on public.portfell_community_portfolios
  for select using (public.portfell_is_community_member(community_id));

drop policy if exists "portfell_community_portfolios_admin" on public.portfell_community_portfolios;
create policy "portfell_community_portfolios_admin" on public.portfell_community_portfolios
  for all using (public.portfell_is_community_admin(community_id))
  with check (public.portfell_is_community_admin(community_id));

insert into public.portfell_community_portfolios (community_id, portfolio_id, label)
select
  'a0000000-0000-4000-8000-000000000001'::uuid,
  p.id,
  p.name
from public.portfell_portfolios p
where p.slug in ('karud', 'lap')
on conflict do nothing;

-- Community members can read pinned sheets (even when owner_id is null)
create or replace function public.portfell_can_read_portfolio(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.portfell_is_portfolio_co_owner(pid)
    or exists (
      select 1
      from public.portfell_portfolio_owners po
      where po.portfolio_id = pid
        and public.portfell_shares_community_with(po.user_id)
    )
    or exists (
      select 1
      from public.portfell_community_portfolios cp
      where cp.portfolio_id = pid
        and public.portfell_is_community_member(cp.community_id)
    );
$$;

drop policy if exists "portfell_portfolios_select" on public.portfell_portfolios;
create policy "portfell_portfolios_select" on public.portfell_portfolios
  for select using (public.portfell_can_read_portfolio(id));

drop policy if exists "portfell_holdings_select" on public.portfell_holdings;
create policy "portfell_holdings_select" on public.portfell_holdings
  for select using (public.portfell_can_read_portfolio(portfolio_id));

-- Claim: alias of Martin is also circle admin; any seed-claim email joins circle
create or replace function public.portfell_claim_seed_for_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text;
  primary_em text;
  claimed text[] := '{}';
  slug text;
  pid uuid;
  is_admin boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;
  primary_em := public.portfell_primary_email(em);
  is_admin := primary_em = 'martin.aasa@upthink.ee';

  insert into public.portfell_profiles (id, email, display_name, avatar_url, updated_at)
  select
    u.id,
    u.email,
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Investor'
    ),
    coalesce(
      nullif(u.raw_user_meta_data->>'avatar_url', ''),
      nullif(u.raw_user_meta_data->>'picture', '')
    ),
    now()
  from auth.users u
  where u.id = uid
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  for slug in
    select portfolio_slug from public.portfell_seed_claims where email = em
  loop
    select id into pid from public.portfell_portfolios where portfell_portfolios.slug = slug;
    if pid is null then
      continue;
    end if;

    update public.portfell_portfolios
    set owner_id = coalesce(owner_id, uid), updated_at = now()
    where id = pid;

    insert into public.portfell_portfolio_owners (portfolio_id, user_id)
    values (pid, uid)
    on conflict do nothing;

    claimed := array_append(claimed, slug);
  end loop;

  insert into public.portfell_lab_state (id, owner_id, conviction, journal, cashflows, arena, badges, updated_at)
  values (uid::text, uid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, now())
  on conflict (id) do update set owner_id = excluded.owner_id;

  if exists (select 1 from public.portfell_seed_claims where email = em)
     or is_admin then
    insert into public.portfell_community_members (community_id, user_id, role)
    values (
      'a0000000-0000-4000-8000-000000000001'::uuid,
      uid,
      case when is_admin then 'admin' else 'member' end
    )
    on conflict (community_id, user_id) do update
      set role = case
        when excluded.role = 'admin' then 'admin'
        else portfell_community_members.role
      end;

    if is_admin then
      update public.portfell_communities
      set created_by = coalesce(created_by, uid), updated_at = now()
      where id = 'a0000000-0000-4000-8000-000000000001'::uuid;
    end if;
  end if;

  return jsonb_build_object(
    'claimed', to_jsonb(claimed),
    'email', em,
    'primary_email', primary_em,
    'user_id', uid
  );
end;
$$;

-- Promote Martina's existing membership to admin (same person as Martin)
update public.portfell_community_members m
set role = 'admin'
from public.portfell_profiles p
where m.user_id = p.id
  and m.community_id = 'a0000000-0000-4000-8000-000000000001'::uuid
  and lower(p.email) = 'aasamartinaasa@gmail.com';
