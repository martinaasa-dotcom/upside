-- Phase 1–3: profiles, portfolio ownership, per-user lab, communities
-- Applied to Upthink Platform via MCP; kept here for repo history.

create table if not exists public.portfell_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfell_seed_claims (
  email text not null,
  portfolio_slug text not null,
  primary key (email, portfolio_slug)
);

insert into public.portfell_seed_claims (email, portfolio_slug) values
  ('martin.aasa@upthink.ee', 'aasad'),
  ('martin.aasa@upthink.ee', 'anu'),
  ('martin.aasa@upthink.ee', 'maryann')
on conflict do nothing;

alter table public.portfell_portfolios
  add column if not exists owner_id uuid references public.portfell_profiles(id) on delete set null;

create index if not exists portfell_portfolios_owner_idx
  on public.portfell_portfolios(owner_id);

alter table public.portfell_lab_state
  add column if not exists owner_id uuid references public.portfell_profiles(id) on delete cascade;

create unique index if not exists portfell_lab_state_owner_uidx
  on public.portfell_lab_state(owner_id)
  where owner_id is not null;

create table if not exists public.portfell_communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.portfell_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfell_community_members (
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists portfell_community_members_user_idx
  on public.portfell_community_members(user_id);

create table if not exists public.portfell_community_invites (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  email text,
  token_hash text not null unique,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_by uuid references public.portfell_profiles(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portfell_community_invites_community_idx
  on public.portfell_community_invites(community_id);

alter table public.portfell_profiles enable row level security;
alter table public.portfell_communities enable row level security;
alter table public.portfell_community_members enable row level security;
alter table public.portfell_community_invites enable row level security;
alter table public.portfell_seed_claims enable row level security;

create or replace function public.portfell_shares_community_with(target_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.portfell_community_members me
    join public.portfell_community_members them
      on them.community_id = me.community_id
    where me.user_id = auth.uid()
      and them.user_id = target_owner
  );
$$;

create or replace function public.portfell_is_community_admin(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.portfell_community_members
    where community_id = cid and user_id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "portfell_portfolios_all" on public.portfell_portfolios;
drop policy if exists "portfell_holdings_all" on public.portfell_holdings;
drop policy if exists "portfell_lab_state_all" on public.portfell_lab_state;
drop policy if exists "portfell_share_links_all" on public.portfell_share_links;
drop policy if exists "portfell_book_snapshots_all" on public.portfell_book_snapshots;

drop policy if exists "portfell_portfolios_select" on public.portfell_portfolios;
drop policy if exists "portfell_portfolios_insert" on public.portfell_portfolios;
drop policy if exists "portfell_portfolios_update" on public.portfell_portfolios;
drop policy if exists "portfell_portfolios_delete" on public.portfell_portfolios;
create policy "portfell_portfolios_select" on public.portfell_portfolios
  for select using (
    owner_id = auth.uid()
    or (owner_id is not null and public.portfell_shares_community_with(owner_id))
  );
create policy "portfell_portfolios_insert" on public.portfell_portfolios
  for insert with check (owner_id = auth.uid());
create policy "portfell_portfolios_update" on public.portfell_portfolios
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "portfell_portfolios_delete" on public.portfell_portfolios
  for delete using (owner_id = auth.uid());

drop policy if exists "portfell_holdings_select" on public.portfell_holdings;
drop policy if exists "portfell_holdings_insert" on public.portfell_holdings;
drop policy if exists "portfell_holdings_update" on public.portfell_holdings;
drop policy if exists "portfell_holdings_delete" on public.portfell_holdings;
create policy "portfell_holdings_select" on public.portfell_holdings
  for select using (
    exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id
        and (
          p.owner_id = auth.uid()
          or (p.owner_id is not null and public.portfell_shares_community_with(p.owner_id))
        )
    )
  );
create policy "portfell_holdings_insert" on public.portfell_holdings
  for insert with check (
    exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id and p.owner_id = auth.uid()
    )
  );
create policy "portfell_holdings_update" on public.portfell_holdings
  for update using (
    exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id and p.owner_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id and p.owner_id = auth.uid()
    )
  );
create policy "portfell_holdings_delete" on public.portfell_holdings
  for delete using (
    exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "portfell_lab_state_select" on public.portfell_lab_state;
drop policy if exists "portfell_lab_state_write" on public.portfell_lab_state;
create policy "portfell_lab_state_select" on public.portfell_lab_state
  for select using (owner_id = auth.uid() or id = 'book');
create policy "portfell_lab_state_write" on public.portfell_lab_state
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "portfell_share_links_select" on public.portfell_share_links;
drop policy if exists "portfell_share_links_owner" on public.portfell_share_links;
create policy "portfell_share_links_select" on public.portfell_share_links
  for select using (true);
create policy "portfell_share_links_owner" on public.portfell_share_links
  for all using (
    portfolio_id is null
    or exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id and p.owner_id = auth.uid()
    )
  ) with check (
    portfolio_id is null
    or exists (
      select 1 from public.portfell_portfolios p
      where p.id = portfolio_id and p.owner_id = auth.uid()
    )
  );

drop policy if exists "portfell_snapshots_select" on public.portfell_book_snapshots;
create policy "portfell_snapshots_select" on public.portfell_book_snapshots
  for select using (true);

drop policy if exists "portfell_profiles_select" on public.portfell_profiles;
drop policy if exists "portfell_profiles_upsert_self" on public.portfell_profiles;
create policy "portfell_profiles_select" on public.portfell_profiles
  for select using (
    id = auth.uid()
    or public.portfell_shares_community_with(id)
  );
create policy "portfell_profiles_upsert_self" on public.portfell_profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "portfell_communities_select" on public.portfell_communities;
drop policy if exists "portfell_communities_insert" on public.portfell_communities;
drop policy if exists "portfell_communities_update" on public.portfell_communities;
create policy "portfell_communities_select" on public.portfell_communities
  for select using (
    exists (
      select 1 from public.portfell_community_members m
      where m.community_id = id and m.user_id = auth.uid()
    )
  );
create policy "portfell_communities_insert" on public.portfell_communities
  for insert with check (created_by = auth.uid());
create policy "portfell_communities_update" on public.portfell_communities
  for update using (public.portfell_is_community_admin(id));

drop policy if exists "portfell_community_members_select" on public.portfell_community_members;
drop policy if exists "portfell_community_members_admin" on public.portfell_community_members;
drop policy if exists "portfell_community_members_self_insert" on public.portfell_community_members;
create policy "portfell_community_members_select" on public.portfell_community_members
  for select using (
    exists (
      select 1 from public.portfell_community_members m
      where m.community_id = community_id and m.user_id = auth.uid()
    )
  );
create policy "portfell_community_members_admin" on public.portfell_community_members
  for all using (public.portfell_is_community_admin(community_id))
  with check (public.portfell_is_community_admin(community_id));
create policy "portfell_community_members_self_insert" on public.portfell_community_members
  for insert with check (user_id = auth.uid());

drop policy if exists "portfell_community_invites_select" on public.portfell_community_invites;
drop policy if exists "portfell_community_invites_admin" on public.portfell_community_invites;
create policy "portfell_community_invites_select" on public.portfell_community_invites
  for select using (
    public.portfell_is_community_admin(community_id)
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
create policy "portfell_community_invites_admin" on public.portfell_community_invites
  for all using (public.portfell_is_community_admin(community_id))
  with check (public.portfell_is_community_admin(community_id));

drop policy if exists "portfell_seed_claims_deny" on public.portfell_seed_claims;
create policy "portfell_seed_claims_deny" on public.portfell_seed_claims
  for select using (false);

insert into public.portfell_communities (id, name)
select 'a0000000-0000-4000-8000-000000000001'::uuid, 'Upside Circle'
where not exists (
  select 1 from public.portfell_communities where name = 'Upside Circle'
);
