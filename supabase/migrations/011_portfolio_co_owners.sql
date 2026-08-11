-- Multi-user co-ownership for portfolios (junction table + RLS)

create table if not exists public.portfell_portfolio_owners (
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, user_id)
);

create index if not exists idx_portfolio_owners_user_id
  on public.portfell_portfolio_owners(user_id);
create index if not exists idx_portfolio_owners_portfolio_id
  on public.portfell_portfolio_owners(portfolio_id);

insert into public.portfell_portfolio_owners (portfolio_id, user_id)
select id, owner_id
from public.portfell_portfolios
where owner_id is not null
on conflict do nothing;

alter table public.portfell_portfolio_owners enable row level security;

create or replace function public.portfell_is_portfolio_co_owner(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.portfell_portfolio_owners
    where portfolio_id = pid and user_id = auth.uid()
  );
$$;

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
    );
$$;

drop policy if exists "portfell_portfolio_owners_select" on public.portfell_portfolio_owners;
drop policy if exists "Co-owners can view ownership records" on public.portfell_portfolio_owners;
drop policy if exists "portfell_portfolio_owners_insert" on public.portfell_portfolio_owners;
drop policy if exists "portfell_portfolio_owners_delete" on public.portfell_portfolio_owners;

create policy "portfell_portfolio_owners_select" on public.portfell_portfolio_owners
  for select using (
    user_id = auth.uid()
    or public.portfell_is_portfolio_co_owner(portfolio_id)
  );

create policy "portfell_portfolio_owners_insert" on public.portfell_portfolio_owners
  for insert with check (
    user_id = auth.uid()
    or public.portfell_is_portfolio_co_owner(portfolio_id)
  );

create policy "portfell_portfolio_owners_delete" on public.portfell_portfolio_owners
  for delete using (public.portfell_is_portfolio_co_owner(portfolio_id));

drop policy if exists "portfell_portfolios_select" on public.portfell_portfolios;
drop policy if exists "portfell_portfolios_insert" on public.portfell_portfolios;
drop policy if exists "portfell_portfolios_update" on public.portfell_portfolios;
drop policy if exists "portfell_portfolios_delete" on public.portfell_portfolios;
drop policy if exists "Co-owners can SELECT portfolios" on public.portfell_portfolios;
drop policy if exists "Co-owners can UPDATE portfolios" on public.portfell_portfolios;

create policy "portfell_portfolios_select" on public.portfell_portfolios
  for select using (public.portfell_can_read_portfolio(id));

create policy "portfell_portfolios_insert" on public.portfell_portfolios
  for insert with check (
    owner_id = auth.uid() or owner_id is null
  );

create policy "portfell_portfolios_update" on public.portfell_portfolios
  for update using (public.portfell_is_portfolio_co_owner(id))
  with check (public.portfell_is_portfolio_co_owner(id));

create policy "portfell_portfolios_delete" on public.portfell_portfolios
  for delete using (public.portfell_is_portfolio_co_owner(id));

drop policy if exists "portfell_holdings_select" on public.portfell_holdings;
drop policy if exists "portfell_holdings_insert" on public.portfell_holdings;
drop policy if exists "portfell_holdings_update" on public.portfell_holdings;
drop policy if exists "portfell_holdings_delete" on public.portfell_holdings;
drop policy if exists "Co-owners can manage holdings" on public.portfell_holdings;

create policy "portfell_holdings_select" on public.portfell_holdings
  for select using (public.portfell_can_read_portfolio(portfolio_id));

create policy "portfell_holdings_insert" on public.portfell_holdings
  for insert with check (public.portfell_is_portfolio_co_owner(portfolio_id));

create policy "portfell_holdings_update" on public.portfell_holdings
  for update using (public.portfell_is_portfolio_co_owner(portfolio_id))
  with check (public.portfell_is_portfolio_co_owner(portfolio_id));

create policy "portfell_holdings_delete" on public.portfell_holdings
  for delete using (public.portfell_is_portfolio_co_owner(portfolio_id));

drop policy if exists "portfell_share_links_owner" on public.portfell_share_links;
create policy "portfell_share_links_owner" on public.portfell_share_links
  for all using (
    portfolio_id is null
    or public.portfell_is_portfolio_co_owner(portfolio_id)
    or created_by = auth.uid()
  ) with check (
    portfolio_id is null
    or public.portfell_is_portfolio_co_owner(portfolio_id)
    or created_by = auth.uid()
  );

create or replace function public.portfell_claim_seed_for_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text;
  claimed text[] := '{}';
  slug text;
  pid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;

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
     or em = 'martin.aasa@upthink.ee' then
    insert into public.portfell_community_members (community_id, user_id, role)
    values (
      'a0000000-0000-4000-8000-000000000001'::uuid,
      uid,
      case when em = 'martin.aasa@upthink.ee' then 'admin' else 'member' end
    )
    on conflict (community_id, user_id) do nothing;

    if em = 'martin.aasa@upthink.ee' then
      update public.portfell_communities
      set created_by = uid, updated_at = now()
      where id = 'a0000000-0000-4000-8000-000000000001'::uuid
        and (created_by is null or created_by = uid);
    end if;
  end if;

  return jsonb_build_object('claimed', to_jsonb(claimed), 'email', em, 'user_id', uid);
end;
$$;

revoke all on function public.portfell_claim_seed_for_me() from public;
grant execute on function public.portfell_claim_seed_for_me() to authenticated;
grant execute on function public.portfell_is_portfolio_co_owner(uuid) to authenticated;
grant execute on function public.portfell_can_read_portfolio(uuid) to authenticated;
