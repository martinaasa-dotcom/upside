-- Upside Lab schema export
-- Concatenated from supabase/migrations in filename order.
-- Apply on an empty dedicated Supabase project (SQL editor or psql).
-- Table names stay portfell_*. Do not rename.
-- Seed rows in early migrations are family-specific; skip or edit them
-- if this instance is not the family book.
--
-- After apply: copy data from the previous project, then point
-- NEXT_PUBLIC_SUPABASE_URL / keys at this instance.
-- See docs/UPSIDE_LAB_CUTOVER.md.


-- ===== 001_portfell_schema.sql =====
-- Upside portfolio tracker schema (legacy filename)
-- Run in Supabase SQL editor or via `supabase db push`

create extension if not exists "pgcrypto";

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  cash_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  ticker text not null,
  shares numeric(14, 4) not null default 0,
  buy_price numeric(14, 4) not null default 0,
  eoy_target numeric(14, 4),
  target_call_pct numeric(8, 4) default 0.15,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, ticker)
);

create table if not exists public.covered_call_targets (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  holding_id uuid references public.holdings(id) on delete set null,
  ticker text not null,
  expiration date not null,
  stock_target numeric(14, 4),
  target_strike numeric(14, 4) not null,
  contracts int not null default 1,
  target_distance_pct numeric(8, 4),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists holdings_portfolio_idx on public.holdings(portfolio_id);
create index if not exists cc_targets_portfolio_idx on public.covered_call_targets(portfolio_id);

alter table public.portfolios enable row level security;
alter table public.holdings enable row level security;
alter table public.covered_call_targets enable row level security;

-- Open policies for personal/local use with anon key.
-- Tighten these once you add auth.
create policy "portfolios_all" on public.portfolios for all using (true) with check (true);
create policy "holdings_all" on public.holdings for all using (true) with check (true);
create policy "cc_targets_all" on public.covered_call_targets for all using (true) with check (true);

-- Seed portfolios matching spreadsheet tabs
insert into public.portfolios (name, slug, sort_order, cash_balance) values
  ('Aasad', 'aasad', 1, -7000),
  ('Anu', 'anu', 2, 0),
  ('MaryAnn', 'maryann', 3, 0),
  ('Karud', 'karud', 4, 0),
  ('Milestones', 'milestones', 5, 0)
on conflict (slug) do nothing;

-- Seed Aasad holdings (approximate from spreadsheet structure)
insert into public.holdings (portfolio_id, ticker, shares, buy_price, eoy_target, target_call_pct, sort_order)
select p.id, h.ticker, h.shares, h.buy_price, h.eoy_target, h.target_call_pct, h.sort_order
from public.portfolios p
cross join (
  values
    ('NBIS', 500::numeric, 95.00::numeric, 180.00::numeric, 0.15::numeric, 1),
    ('CRWV', 800::numeric, 42.50::numeric, 75.00::numeric, 0.14::numeric, 2),
    ('RKLB', 1200::numeric, 28.00::numeric, 55.00::numeric, 0.16::numeric, 3),
    ('BMNR', 2000::numeric, 18.75::numeric, 35.00::numeric, 0.15::numeric, 4),
    ('VST', 400::numeric, 165.00::numeric, 220.00::numeric, 0.12::numeric, 5)
) as h(ticker, shares, buy_price, eoy_target, target_call_pct, sort_order)
where p.slug = 'aasad'
on conflict (portfolio_id, ticker) do nothing;

-- ===== 002_stock_target_override.sql =====
-- Optional manual Stock Target override (null = use resistance model)
alter table public.holdings
  add column if not exists stock_target_override numeric(12, 4);

-- ===== 003_portfell_upthink.sql =====
-- Upside (legacy table prefix portfell_*) on shared Upthink Platform Supabase
-- Prefixed tables sit beside gifttier_*/wraptier_*/shiptier_*

create extension if not exists "pgcrypto";

create table if not exists public.portfell_portfolios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order int not null default 0,
  cash_balance numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfell_holdings (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  ticker text not null,
  shares numeric(14, 4) not null default 0,
  buy_price numeric(14, 4) not null default 0,
  eoy_target numeric(14, 4),
  target_call_pct numeric(8, 4) default 0.15,
  stock_target_override numeric(12, 4),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, ticker)
);

create index if not exists portfell_holdings_portfolio_idx
  on public.portfell_holdings(portfolio_id);

alter table public.portfell_portfolios enable row level security;
alter table public.portfell_holdings enable row level security;

-- Shared personal tracker (friends on same deploy share one book).
-- Tighten with auth later if needed.
drop policy if exists "portfell_portfolios_all" on public.portfell_portfolios;
drop policy if exists "portfell_holdings_all" on public.portfell_holdings;
create policy "portfell_portfolios_all" on public.portfell_portfolios
  for all using (true) with check (true);
create policy "portfell_holdings_all" on public.portfell_holdings
  for all using (true) with check (true);

-- ===== 004_portfell_book_snapshots.sql =====
-- Daily / pre-delete book snapshots for Upside recovery
create table if not exists public.portfell_book_snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('nightly', 'pre_delete', 'manual')),
  label text not null default '',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists portfell_book_snapshots_created_idx
  on public.portfell_book_snapshots (created_at desc);

alter table public.portfell_book_snapshots enable row level security;

drop policy if exists "portfell_book_snapshots_all" on public.portfell_book_snapshots;
create policy "portfell_book_snapshots_all" on public.portfell_book_snapshots
  for all using (true) with check (true);

-- ===== 005_portfell_rls_select_only_optional.sql =====
-- OPTIONAL: only after SUPABASE_SERVICE_ROLE_KEY is set on the API.
-- Deny anon/authenticated writes; API must use service role for mutations.
-- Do not apply until service role is configured or all writes will fail.

-- drop policy if exists "portfell_portfolios_all" on public.portfell_portfolios;
-- drop policy if exists "portfell_holdings_all" on public.portfell_holdings;
-- drop policy if exists "portfell_book_snapshots_all" on public.portfell_book_snapshots;
--
-- create policy "portfell_portfolios_select" on public.portfell_portfolios
--   for select using (true);
-- create policy "portfell_holdings_select" on public.portfell_holdings
--   for select using (true);
-- create policy "portfell_book_snapshots_select" on public.portfell_book_snapshots
--   for select using (true);

-- ===== 006_portfell_lab_and_share.sql =====
-- Shared Lab state + read-only share links for Upside (portfell_*)

create table if not exists public.portfell_lab_state (
  id text primary key default 'book',
  conviction jsonb not null default '{}'::jsonb,
  journal jsonb not null default '[]'::jsonb,
  cashflows jsonb not null default '[]'::jsonb,
  arena jsonb not null default '{}'::jsonb,
  badges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.portfell_lab_state (id)
values ('book')
on conflict (id) do nothing;

create table if not exists public.portfell_share_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default 'Guest link',
  scope text not null default 'overview'
    check (scope in ('overview', 'sheet', 'lab')),
  portfolio_id uuid references public.portfell_portfolios(id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portfell_share_links_token_idx
  on public.portfell_share_links(token_hash);

alter table public.portfell_lab_state enable row level security;
alter table public.portfell_share_links enable row level security;

drop policy if exists "portfell_lab_state_all" on public.portfell_lab_state;
drop policy if exists "portfell_share_links_all" on public.portfell_share_links;

-- Same open personal-book model as other portfell_* tables (PIN gates API writes).
create policy "portfell_lab_state_all" on public.portfell_lab_state
  for all using (true) with check (true);
create policy "portfell_share_links_all" on public.portfell_share_links
  for all using (true) with check (true);

-- ===== 007_portfolio_access_secret.sql =====
-- Per-sheet access secret (PIN or password). NULL = use book default UPSIDE_OWNER_PIN.
alter table public.portfell_portfolios
  add column if not exists access_secret_hash text;

comment on column public.portfell_portfolios.access_secret_hash is
  'scrypt hash of sheet PIN/password; null means book default UPSIDE_OWNER_PIN';

-- ===== 008_auth_ownership_and_communities.sql =====
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

-- ===== 009_share_links_created_by.sql =====
-- Scope guest share links to the creating owner's book
alter table public.portfell_share_links
  add column if not exists created_by uuid references public.portfell_profiles(id) on delete set null;

create index if not exists portfell_share_links_created_by_idx
  on public.portfell_share_links(created_by);

-- ===== 010_claim_seed_security_definer.sql =====
-- Allow signed-in users to claim seed portfolios without service role
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
    update public.portfell_portfolios
    set owner_id = uid, updated_at = now()
    where portfell_portfolios.slug = slug
      and (owner_id is null or owner_id = uid);
    if found then
      claimed := array_append(claimed, slug);
    end if;
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

-- ===== 011_portfolio_co_owners.sql =====
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

-- ===== 012_profile_bio_portfolio_invites.sql =====
-- Profile bio for community appearance + portfolio co-owner invite codes

alter table public.portfell_profiles
  add column if not exists bio text;

comment on column public.portfell_profiles.bio is
  'Short community blurb shown next to display_name';

create table if not exists public.portfell_portfolio_invites (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  token_hash text not null unique,
  email text,
  created_by uuid references public.portfell_profiles(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portfell_portfolio_invites_portfolio_idx
  on public.portfell_portfolio_invites(portfolio_id);

alter table public.portfell_portfolio_invites enable row level security;

drop policy if exists "portfell_portfolio_invites_select" on public.portfell_portfolio_invites;
drop policy if exists "portfell_portfolio_invites_write" on public.portfell_portfolio_invites;

create policy "portfell_portfolio_invites_select" on public.portfell_portfolio_invites
  for select using (
    public.portfell_is_portfolio_co_owner(portfolio_id)
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "portfell_portfolio_invites_write" on public.portfell_portfolio_invites
  for all using (public.portfell_is_portfolio_co_owner(portfolio_id))
  with check (public.portfell_is_portfolio_co_owner(portfolio_id));

-- ===== 013_drop_sheet_pin_and_share_links.sql =====
-- Drop sheet PIN/password and guest share links (auth = Google co-ownership only).

drop table if exists public.portfell_share_links;

alter table public.portfell_portfolios
  drop column if exists access_secret_hash;

-- ===== 014_fix_community_members_rls_recursion.sql =====
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

-- ===== 015_superadmin_overview.sql =====
-- Superadmin overview for Martin / Martina (email allowlist).
-- Works without service role: RPC is security definer and checks JWT email.

create or replace function public.portfell_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'martin.aasa@upthink.ee',
    'aasamartinaasa@gmail.com'
  );
$$;

revoke all on function public.portfell_is_superadmin() from public;
grant execute on function public.portfell_is_superadmin() to authenticated;

create or replace function public.portfell_superadmin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.portfell_is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url,
          'bio', p.bio,
          'profile_created_at', p.created_at,
          'profile_updated_at', p.updated_at,
          'last_sign_in_at', u.last_sign_in_at,
          'email_confirmed_at', u.email_confirmed_at
        )
        order by coalesce(u.last_sign_in_at, p.created_at) desc nulls last
      )
      from public.portfell_profiles p
      left join auth.users u on u.id = p.id
    ), '[]'::jsonb),
    'communities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'created_by', c.created_by,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'member_count', (
            select count(*)::int
            from public.portfell_community_members m
            where m.community_id = c.id
          ),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'user_id', m.user_id,
                'role', m.role,
                'joined_at', m.joined_at,
                'email', pr.email,
                'display_name', pr.display_name,
                'avatar_url', pr.avatar_url
              )
              order by
                case when m.role = 'admin' then 0 else 1 end,
                coalesce(pr.display_name, pr.email, '')
            )
            from public.portfell_community_members m
            left join public.portfell_profiles pr on pr.id = m.user_id
            where m.community_id = c.id
          ), '[]'::jsonb)
        )
        order by c.name
      )
      from public.portfell_communities c
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.portfell_superadmin_overview() from public;
grant execute on function public.portfell_superadmin_overview() to authenticated;

-- ===== 016_account_aliases_and_community_sheets.sql =====
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

-- ===== 017_harden_portfell_rls.sql =====
-- Harden portfell_* RLS: close self-escalation + public data leaks found in audit.
-- Applied to Upthink Platform via MCP; kept here for repo history.

-- 1) portfell_portfolio_owners INSERT allowed `user_id = auth.uid()` unconditionally,
--    letting any signed-in stranger self-grant co-ownership of ANY portfolio via a
--    direct REST call. The app only ever writes this table via service role or the
--    portfell_claim_seed_for_me() security-definer RPC (both already bypass RLS),
--    so restricting to existing co-owners has no functional impact.
drop policy if exists "portfell_portfolio_owners_insert" on public.portfell_portfolio_owners;
create policy "portfell_portfolio_owners_insert" on public.portfell_portfolio_owners
  for insert with check (public.portfell_is_portfolio_co_owner(portfolio_id));

-- 2) portfell_book_snapshots was world-readable (`using (true)`) via the public anon
--    key, exposing full historical portfolio payloads (cash, holdings, buy prices)
--    for every user. The app only reads this table server-side via service role
--    (/api/snapshots); restrict direct API access to superadmins.
drop policy if exists "portfell_snapshots_select" on public.portfell_book_snapshots;
create policy "portfell_snapshots_select" on public.portfell_book_snapshots
  for select using (public.portfell_is_superadmin());

-- 3) portfell_lab_state let anyone read the legacy shared id='book' row regardless
--    of ownership (dead code path — nothing reads that id anymore). Scope strictly
--    to the signed-in owner.
drop policy if exists "portfell_lab_state_select" on public.portfell_lab_state;
create policy "portfell_lab_state_select" on public.portfell_lab_state
  for select using (owner_id = auth.uid());

-- 4) Invite SELECT policies compared two nullable emails via coalesce-to-'', so an
--    invite with a NULL email (the common "shareable link, no email lock" case)
--    matched ANY caller — including anon — because coalesce(null,'') = coalesce(null,'').
--    Require both sides to be non-null before comparing.
drop policy if exists "portfell_community_invites_select" on public.portfell_community_invites;
create policy "portfell_community_invites_select" on public.portfell_community_invites
  for select using (
    public.portfell_is_community_admin(community_id)
    or (
      email is not null
      and (auth.jwt() ->> 'email') is not null
      and lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "portfell_portfolio_invites_select" on public.portfell_portfolio_invites;
create policy "portfell_portfolio_invites_select" on public.portfell_portfolio_invites
  for select using (
    public.portfell_is_portfolio_co_owner(portfolio_id)
    or (
      email is not null
      and (auth.jwt() ->> 'email') is not null
      and lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

-- ===== 018_fix_claim_seed_slug_ambiguity.sql =====
-- Fix long-standing bug: portfell_claim_seed_for_me() declared a PL/pgSQL
-- loop variable named `slug`, which collides with the portfell_portfolios.slug
-- column. Any bare reference to `slug` inside an embedded SQL statement raises
-- "column reference \"slug\" is ambiguous", aborting the whole function (and
-- rolling back everything it already did, including the profile upsert) before
-- it ever reaches the portfolio_owners insert. This has silently blocked EVERY
-- first-time seed claim since it was introduced (migration 010) for anyone not
-- manually seeded via scripts/seed-ownership.sql — confirmed via Postgres logs
-- showing this error on every single call, and reproduced live for Rasmus
-- (rasmusmarjapuu@gmail.com / Karud), who signed in but ended up with no
-- profile, no ownership row, and "No sheets in My book yet".
--
-- Applied to Upthink Platform via MCP; kept here for repo history.
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
  claim_slug text;
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

  for claim_slug in
    select portfolio_slug from public.portfell_seed_claims where email = em
  loop
    select id into pid from public.portfell_portfolios where portfell_portfolios.slug = claim_slug;
    if pid is null then
      continue;
    end if;

    update public.portfell_portfolios
    set owner_id = coalesce(owner_id, uid), updated_at = now()
    where id = pid;

    insert into public.portfell_portfolio_owners (portfolio_id, user_id)
    values (pid, uid)
    on conflict do nothing;

    claimed := array_append(claimed, claim_slug);
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

-- ===== 019_admin_overview_portfolios.sql =====
-- Surface each user's owned/co-owned portfolios in the superadmin overview.
--
-- Motivation: the Rasmus seed-claim bug (migration 018) left him signed in
-- with a profile row but zero portfolio_owners rows -- invisible in the old
-- overview, which only showed profile + last-sign-in. A "0 portfolios" flag
-- next to an active user is exactly the kind of thing this page exists to
-- catch, so surface portfolio ownership directly instead of requiring a
-- manual SQL query every time.
create or replace function public.portfell_superadmin_overview()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  result jsonb;
begin
  if not public.portfell_is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url,
          'bio', p.bio,
          'profile_created_at', p.created_at,
          'profile_updated_at', p.updated_at,
          'last_sign_in_at', u.last_sign_in_at,
          'email_confirmed_at', u.email_confirmed_at,
          'portfolios', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', pf.id, 'name', pf.name)
              order by pf.name
            )
            from public.portfell_portfolio_owners po
            join public.portfell_portfolios pf on pf.id = po.portfolio_id
            where po.user_id = p.id
          ), '[]'::jsonb)
        )
        order by coalesce(u.last_sign_in_at, p.created_at) desc nulls last
      )
      from public.portfell_profiles p
      left join auth.users u on u.id = p.id
    ), '[]'::jsonb),
    'communities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'created_by', c.created_by,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'member_count', (
            select count(*)::int
            from public.portfell_community_members m
            where m.community_id = c.id
          ),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'user_id', m.user_id,
                'role', m.role,
                'joined_at', m.joined_at,
                'email', pr.email,
                'display_name', pr.display_name,
                'avatar_url', pr.avatar_url
              )
              order by
                case when m.role = 'admin' then 0 else 1 end,
                coalesce(pr.display_name, pr.email, '')
            )
            from public.portfell_community_members m
            left join public.portfell_profiles pr on pr.id = m.user_id
            where m.community_id = c.id
          ), '[]'::jsonb)
        )
        order by c.name
      )
      from public.portfell_communities c
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$function$;

-- ===== 020_community_peer_portfolio_owners_select.sql =====
-- Community members can see co-ownership rows for peers in the same circle.
-- Without this, the communities API (session client, no service role) could not
-- attribute pinned sheets like Lap to signed-in members — they stayed "awaiting sign-in".

drop policy if exists "portfell_portfolio_owners_select" on public.portfell_portfolio_owners;

create policy "portfell_portfolio_owners_select" on public.portfell_portfolio_owners
  for select using (
    user_id = auth.uid()
    or public.portfell_is_portfolio_co_owner(portfolio_id)
    or public.portfell_shares_community_with(user_id)
  );

-- ===== 020_delete_my_account.sql =====
-- Self-service account deletion (GDPR-style "right to erasure" for app data).
--
-- Runs as security definer but is strictly self-scoped to auth.uid() — a
-- caller can never touch anyone else's rows. Leans on the FK cascades that
-- already exist (portfell_holdings/portfell_portfolio_owners -> portfolios
-- on delete cascade; portfell_lab_state/portfell_community_members ->
-- portfell_profiles on delete cascade) so most cleanup happens for free.
--
-- Note: this cannot delete the underlying auth.users row (needs the
-- service-role admin API, which this project doesn't run with in prod). The
-- account can still sign back in afterwards, but lands as a brand-new user
-- with none of their old data — the API route and UI copy are explicit
-- about this limitation.
create or replace function public.portfell_delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  deleted_portfolios text[] := '{}';
  kept_portfolios text[] := '{}';
  rec record;
  owner_count int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  for rec in
    select po.portfolio_id, p.name
    from public.portfell_portfolio_owners po
    join public.portfell_portfolios p on p.id = po.portfolio_id
    where po.user_id = uid
  loop
    select count(*) into owner_count
    from public.portfell_portfolio_owners
    where portfolio_id = rec.portfolio_id;

    if owner_count <= 1 then
      -- Sole owner: delete the sheet outright. Cascades take care of
      -- portfell_holdings, portfell_portfolio_owners, portfell_portfolio_invites,
      -- and portfell_community_portfolios rows tied to it.
      delete from public.portfell_portfolios where id = rec.portfolio_id;
      deleted_portfolios := array_append(deleted_portfolios, rec.name);
    else
      -- Shared sheet: leave it for the other owner(s). This user's row in
      -- portfell_portfolio_owners is cleaned up below by the profile delete.
      kept_portfolios := array_append(kept_portfolios, rec.name);
    end if;
  end loop;

  -- Cascades from here: remaining portfell_portfolio_owners rows (shared
  -- sheets), portfell_lab_state, portfell_community_members. Communities
  -- this user created keep existing (created_by -> set null) so co-members
  -- aren't affected.
  delete from public.portfell_profiles where id = uid;

  return jsonb_build_object(
    'deleted_portfolios', to_jsonb(deleted_portfolios),
    'left_shared_portfolios', to_jsonb(kept_portfolios)
  );
end;
$$;

revoke all on function public.portfell_delete_my_account() from public;
grant execute on function public.portfell_delete_my_account() to authenticated;

-- ===== 021_create_portfolio_security_definer.sql =====
-- A brand-new user's first "Create sheet" click was failing with
-- "new row violates row-level security policy for table portfell_portfolios".
--
-- The portfell_portfolios INSERT policy is `(owner_id = auth.uid()) or
-- (owner_id is null)` -- correct in principle, but the app performed this as
-- two separate ordinary-client calls (insert portfolio, then upsert the
-- owner row) built from two independently-constructed Supabase clients per
-- request (one from requireAuthUser(), one from getSupabaseDataClient()).
-- That's the same class of "ownership-based RLS can't cleanly express a
-- self-service first write" problem already solved elsewhere in this schema
-- via security-definer RPCs (portfell_claim_seed_for_me, invite redemption,
-- account deletion) -- auth.uid() resolves reliably inside a security
-- definer function regardless of which client/session object triggered it,
-- and running as the function owner sidesteps the per-role RLS check
-- entirely instead of depending on it matching exactly.
--
-- Bonus fixes along the way: the old two-step app code left an orphaned,
-- owner-less portfolio if the second (owner-row) write ever failed after
-- the first succeeded; and slugify() had no collision handling at all, so
-- two people independently naming a sheet "My Portfolio" would 500 on a
-- unique-constraint violation for the second one. Both fixed by making
-- this one atomic function with slug disambiguation.
create or replace function public.portfell_create_portfolio_for_me(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  base_slug text;
  new_slug text;
  suffix int := 1;
  next_sort int;
  new_row public.portfell_portfolios;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'name required';
  end if;

  base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(base_slug, '-');
  if base_slug = '' then
    base_slug := 'sheet';
  end if;
  new_slug := base_slug;

  while exists (select 1 from public.portfell_portfolios where slug = new_slug) loop
    suffix := suffix + 1;
    new_slug := base_slug || '-' || suffix;
  end loop;

  select coalesce(count(*), 0) + 1 into next_sort
  from public.portfell_portfolio_owners
  where user_id = uid;

  insert into public.portfell_portfolios (name, slug, sort_order, cash_balance, owner_id)
  values (trim(p_name), new_slug, next_sort, 0, uid)
  returning * into new_row;

  insert into public.portfell_portfolio_owners (portfolio_id, user_id)
  values (new_row.id, uid)
  on conflict (portfolio_id, user_id) do nothing;

  return jsonb_build_object(
    'id', new_row.id,
    'name', new_row.name,
    'slug', new_row.slug,
    'sort_order', new_row.sort_order,
    'cash_balance', new_row.cash_balance,
    'created_at', new_row.created_at,
    'updated_at', new_row.updated_at,
    'owner_id', new_row.owner_id
  );
end;
$$;

revoke all on function public.portfell_create_portfolio_for_me(text) from public;
grant execute on function public.portfell_create_portfolio_for_me(text) to authenticated;

-- ===== 022_error_log.sql =====
-- Self-hosted error log (no new third-party account needed) so a broken
-- deploy or unhandled exception shows up somewhere durable and visible
-- instead of only being caught by a user reporting it live, or a manual
-- Postgres-log dig like the service-role-key incident on 2026-08-12.
--
-- Open insert mirrors the portfell_book_snapshots precedent (017/020):
-- write-only, no payload exposed on list, so letting anyone/anon insert is
-- low-risk and means error reporting still works pre-login (sign-in screen
-- errors) and from instrumentation.ts (which runs outside a user session).
-- Read stays superadmin-only.
create table if not exists public.portfell_error_log (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('client', 'server')),
  message text not null,
  stack text,
  digest text,
  path text,
  route_type text,
  user_id uuid,
  user_email text,
  user_agent text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portfell_error_log_created_idx
  on public.portfell_error_log (created_at desc);

alter table public.portfell_error_log enable row level security;

drop policy if exists "portfell_error_log_insert" on public.portfell_error_log;
create policy "portfell_error_log_insert" on public.portfell_error_log
  for insert with check (true);

drop policy if exists "portfell_error_log_select" on public.portfell_error_log;
create policy "portfell_error_log_select" on public.portfell_error_log
  for select using (public.portfell_is_superadmin());

drop policy if exists "portfell_error_log_delete" on public.portfell_error_log;
create policy "portfell_error_log_delete" on public.portfell_error_log
  for delete using (public.portfell_is_superadmin());

-- ===== 023_margus_fund.sql =====
-- Margus Fund: a single, global, AI-autonomous paper portfolio ($50,000
-- start) that every signed-in user can watch (read-only) — Margus reviews
-- his holdings and optionally opens new ones once a day via a cron job,
-- always writing a short dated report explaining what he did and why
-- (including explicitly reasoning through "no action" days).
--
-- Singleton pattern (id='main') rather than per-user: the whole point is
-- one followable feed, not a personalized sandbox — that's what Lab's
-- existing Paper Arena already covers per-user.
--
-- Read is open to any authenticated user. There are deliberately NO
-- insert/update/delete policies for authenticated/anon — only the
-- service-role cron job can write, which bypasses RLS entirely. Nobody,
-- including superadmins, can hand-edit Margus's trades through the API;
-- that would defeat the "autonomous" premise this feature is built on.
create table if not exists public.portfell_margus_fund (
  id text primary key default 'main',
  cash numeric(14, 2) not null default 50000,
  starting_capital numeric(14, 2) not null default 50000,
  inception_date date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists public.portfell_margus_fund_holdings (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  shares numeric(14, 4) not null,
  cost_basis numeric(14, 4) not null,
  entry_date date not null default current_date,
  thesis text not null,
  target_timeframe text,
  exit_plan text,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at date,
  exit_reasoning text,
  realized_pnl numeric(14, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfell_margus_fund_holdings_status_idx
  on public.portfell_margus_fund_holdings (status);

create table if not exists public.portfell_margus_fund_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  headline text not null,
  body text not null,
  actions jsonb not null default '[]'::jsonb,
  portfolio_value numeric(14, 2) not null,
  cash numeric(14, 2) not null,
  day_change_dollar numeric(14, 2),
  day_change_pct numeric(10, 6),
  total_return_pct numeric(10, 6),
  created_at timestamptz not null default now()
);

create index if not exists portfell_margus_fund_reports_date_idx
  on public.portfell_margus_fund_reports (report_date desc);

alter table public.portfell_margus_fund enable row level security;
alter table public.portfell_margus_fund_holdings enable row level security;
alter table public.portfell_margus_fund_reports enable row level security;

drop policy if exists "portfell_margus_fund_select" on public.portfell_margus_fund;
create policy "portfell_margus_fund_select" on public.portfell_margus_fund
  for select using (auth.uid() is not null);

drop policy if exists "portfell_margus_fund_holdings_select" on public.portfell_margus_fund_holdings;
create policy "portfell_margus_fund_holdings_select" on public.portfell_margus_fund_holdings
  for select using (auth.uid() is not null);

drop policy if exists "portfell_margus_fund_reports_select" on public.portfell_margus_fund_reports;
create policy "portfell_margus_fund_reports_select" on public.portfell_margus_fund_reports
  for select using (auth.uid() is not null);

insert into public.portfell_margus_fund (id, cash, starting_capital, inception_date)
values ('main', 50000, 50000, current_date)
on conflict (id) do nothing;

-- ===== 024_margus_fund_spy_benchmark.sql =====
-- Store SPY's price alongside each daily Upside Portfolio report so an
-- "equally-funded SPY" benchmark line can accumulate day-by-day, in lockstep
-- with Margus's own report history -- no separate historical backfill
-- needed since both start from the same inception date.
alter table public.portfell_margus_fund_reports
  add column if not exists spy_price numeric(14, 4);

-- ===== 025_margus_fund_weekly_recap.sql =====
-- Upside Portfolio weekly recap -- a reflective, LLM-authored step-back
-- generated once a week (Friday's close) rather than the terse daily
-- report format. Separate table from portfell_margus_fund_reports since
-- report_date there is already uniquely keyed per calendar day and a
-- recap covers a date RANGE, not a single day.
create table if not exists public.portfell_margus_fund_weekly_recaps (
  id uuid primary key default gen_random_uuid(),
  week_ending date not null unique,
  headline text not null,
  body text not null,
  week_return_pct numeric(10, 6),
  spy_week_return_pct numeric(10, 6),
  portfolio_value_start numeric(14, 2),
  portfolio_value_end numeric(14, 2),
  created_at timestamptz not null default now()
);

create index if not exists portfell_margus_fund_weekly_recaps_date_idx
  on public.portfell_margus_fund_weekly_recaps (week_ending desc);

alter table public.portfell_margus_fund_weekly_recaps enable row level security;

-- Same policy shape as the rest of the Margus Fund tables: readable by any
-- signed-in user, writable only by the service-role cron.
drop policy if exists "portfell_margus_fund_weekly_recaps_select" on public.portfell_margus_fund_weekly_recaps;
create policy "portfell_margus_fund_weekly_recaps_select" on public.portfell_margus_fund_weekly_recaps
  for select using (auth.uid() is not null);

-- ===== 026_experience_tier.sql =====
-- Self-reported experience tier, set via a short onboarding questionnaire
-- (shown once to new AND existing users until answered) and changeable
-- later from Account. Drives which tabs/panels default to visible so the
-- app doesn't dump every feature on someone who just wants the basics.
alter table public.portfell_profiles
  add column if not exists experience_tier text
    check (experience_tier in ('novice', 'investor', 'advanced'));

-- ===== 027_knows_options.sql =====
-- Options familiarity is its own flag, separate from experience_tier.
-- Someone can be an overall "advanced" investor who has never touched
-- options -- the onboarding tier (max of the two answers) would still
-- show them options UI, which is exactly backwards for that combination.
alter table public.portfell_profiles
  add column if not exists knows_options boolean;

-- ===== 028_rls_deep_sweep_hardening.sql =====
-- Deep security sweep: close a community-membership self-escalation hole,
-- lock down whole-book snapshot writes, and stop exposing internal lookup
-- tables/RPCs to direct anon/authenticated REST calls that bypass the app.

-- 1) CRITICAL: portfell_community_members allowed ANY authenticated user to
--    insert themselves into ANY community with ANY role (including admin) —
--    the with_check only verified `user_id = auth.uid()`, with no tie back
--    to the community itself. Anyone who learned/guessed a community_id
--    (e.g. from a shared URL) could self-promote to admin and, via
--    portfell_shares_community_with(), gain read access to every member's
--    portfolios. Scope self-insert to "you are the creator of this specific
--    community" — the only legitimate use (becoming first admin right after
--    creating a community).
drop policy if exists portfell_community_members_self_insert on public.portfell_community_members;
create policy portfell_community_members_self_insert
  on public.portfell_community_members
  for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.portfell_communities c
      where c.id = community_id and c.created_by = auth.uid()
    )
  );

-- 2) portfell_book_snapshots INSERT/DELETE were wide open (`true`) to the
--    public role — any anon or authenticated caller could wipe or spam the
--    entire backup history via a direct REST call, bypassing the app's own
--    service-role gating in /api/snapshots entirely. Match the already-locked
--    SELECT policy: superadmin only. The app's real read/write paths use the
--    service-role client, which bypasses RLS and is unaffected by this.
drop policy if exists portfell_snapshots_insert on public.portfell_book_snapshots;
create policy portfell_snapshots_insert
  on public.portfell_book_snapshots
  for insert
  with check (public.portfell_is_superadmin());

drop policy if exists portfell_snapshots_delete on public.portfell_book_snapshots;
create policy portfell_snapshots_delete
  on public.portfell_book_snapshots
  for delete
  using (public.portfell_is_superadmin());

-- 3) portfell_account_aliases was readable by anyone (anon included) via
--    direct REST, exposing the full household-alias/email map. Nothing in
--    the app queries it client-side — every read goes through server routes
--    on the service-role client (loadAliasMap), which bypasses RLS anyway.
--    Deny all direct client reads.
drop policy if exists portfell_account_aliases_select on public.portfell_account_aliases;
create policy portfell_account_aliases_select
  on public.portfell_account_aliases
  for select
  using (false);

-- 4) portfell_lookup_profile_id_by_email had no auth.uid() guard and was
--    executable by anon, making it a plain email-enumeration oracle (returns
--    a profile id or null for any email, no session required, no rate
--    limit). Require a signed-in caller and drop anon's execute grant.
--    `authenticated` keeps execute since addCoOwnerToPortfolio still calls
--    it under the caller's own session when no service-role key is set.
create or replace function public.portfell_lookup_profile_id_by_email(p_email text)
returns uuid
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when auth.uid() is null then null
    else (
      select id from public.portfell_profiles
      where lower(email) = lower(trim(p_email))
      limit 1
    )
  end;
$$;
revoke execute on function public.portfell_lookup_profile_id_by_email(text) from anon;

-- 5) portfell_portfolios INSERT allowed owner_id IS NULL for any
--    authenticated caller. Not exploitable today (an ownerless row can't be
--    read back or claimed via RLS — inserting the first owner row itself
--    requires already being a co-owner), but it's stale: all real creation
--    now goes through the portfell_create_portfolio_for_me() security-
--    definer RPC. Tighten direct inserts to strict self-ownership.
drop policy if exists portfell_portfolios_insert on public.portfell_portfolios;
create policy portfell_portfolios_insert
  on public.portfell_portfolios
  for insert
  with check (owner_id = auth.uid());

-- ===== 029_community_admin_delete.sql =====
-- Community admins can already rename via the existing
-- portfell_communities_update policy (portfell_is_community_admin), but
-- there was no DELETE policy at all, so removing a community outright had
-- no RLS-level path (only worked if a caller happened to be on the
-- service-role client). Add it explicitly, mirroring the update policy,
-- so "delete this community" is safe even if the service-role key is ever
-- unset and the app falls back to the caller's own session.
drop policy if exists "portfell_communities_delete" on public.portfell_communities;
create policy "portfell_communities_delete"
  on public.portfell_communities
  for delete
  using (public.portfell_is_community_admin(id));

-- ===== 030_no_auto_join_communities.sql =====
-- Stop auto-joining anyone to Upside Circle (or any community) on sign-in.
-- portfell_claim_seed_for_me() only auto-joined seed-claimed family members
-- (or the hardcoded admin email), but the app-code path in
-- ensure-profile.ts auto-joined *every* signed-in user unconditionally —
-- meaning any stranger creating an account got silently added to Upside
-- Circle and granted read access to the family's books (and vice versa).
-- Community membership is now opt-in only: an invite link for private
-- communities, or a request an admin approves for public ones. Seed
-- portfolio *ownership* claiming (unrelated to community membership) is
-- untouched below.
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
  claim_slug text;
  pid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;
  primary_em := public.portfell_primary_email(em);

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

  for claim_slug in
    select portfolio_slug from public.portfell_seed_claims where email = em
  loop
    select id into pid from public.portfell_portfolios where portfell_portfolios.slug = claim_slug;
    if pid is null then
      continue;
    end if;

    update public.portfell_portfolios
    set owner_id = coalesce(owner_id, uid), updated_at = now()
    where id = pid;

    insert into public.portfell_portfolio_owners (portfolio_id, user_id)
    values (pid, uid)
    on conflict do nothing;

    claimed := array_append(claimed, claim_slug);
  end loop;

  insert into public.portfell_lab_state (id, owner_id, conviction, journal, cashflows, arena, badges, updated_at)
  values (uid::text, uid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, now())
  on conflict (id) do update set owner_id = excluded.owner_id;

  return jsonb_build_object(
    'claimed', to_jsonb(claimed),
    'email', em,
    'primary_email', primary_em,
    'user_id', uid
  );
end;
$$;

-- ===== 031_community_visibility_join_requests.sql =====
-- Public vs private communities + a request-to-join flow for public ones.
-- Private (the default) stays exactly as it works today: invite-only.
-- Public communities become discoverable to any signed-in user, who can
-- ask to join; an admin has to approve before they get read access to
-- anyone's book.

alter table public.portfell_communities
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'private'));

-- Existing communities (Upside Circle included) default to private via the
-- column default above — nothing becomes newly discoverable by accident.

-- Let anyone signed-in see PUBLIC communities (name + id only, for
-- discovery) in addition to the communities they already belong to. The
-- membership half keeps using the security-definer helper from migration
-- 014 to avoid RLS recursion against portfell_community_members.
drop policy if exists "portfell_communities_select" on public.portfell_communities;
create policy "portfell_communities_select" on public.portfell_communities
  for select using (
    visibility = 'public' or public.portfell_is_community_member(id)
  );

create table if not exists public.portfell_community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  message text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.portfell_profiles(id) on delete set null,
  unique (community_id, user_id)
);

alter table public.portfell_community_join_requests enable row level security;

drop policy if exists "portfell_join_requests_select" on public.portfell_community_join_requests;
create policy "portfell_join_requests_select" on public.portfell_community_join_requests
  for select using (
    user_id = auth.uid() or public.portfell_is_community_admin(community_id)
  );

drop policy if exists "portfell_join_requests_insert" on public.portfell_community_join_requests;
create policy "portfell_join_requests_insert" on public.portfell_community_join_requests
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.portfell_communities c
      where c.id = community_id and c.visibility = 'public'
    )
  );

-- Two update policies, combined with OR: an admin can move any request to
-- approved/rejected; a requester can only reset their own (e.g. previously
-- rejected) request back to pending — they can never approve themselves.
drop policy if exists "portfell_join_requests_admin_update" on public.portfell_community_join_requests;
create policy "portfell_join_requests_admin_update" on public.portfell_community_join_requests
  for update using (public.portfell_is_community_admin(community_id))
  with check (public.portfell_is_community_admin(community_id));

drop policy if exists "portfell_join_requests_requester_update" on public.portfell_community_join_requests;
create policy "portfell_join_requests_requester_update" on public.portfell_community_join_requests
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "portfell_join_requests_delete" on public.portfell_community_join_requests;
create policy "portfell_join_requests_delete" on public.portfell_community_join_requests
  for delete using (
    user_id = auth.uid() or public.portfell_is_community_admin(community_id)
  );

-- ===== 032_community_duels.sql =====
-- Shared Daily Duel picks inside a community. One pick per member per
-- Tallinn day. Pair is stored on the first insert so later holdings
-- changes cannot rewrite today's matchup.

create table if not exists public.portfell_community_duels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  day_key text not null,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  ticker_a text not null,
  ticker_b text not null,
  pick text not null check (pick in ('a', 'b')),
  created_at timestamptz not null default now(),
  unique (community_id, day_key, user_id)
);

create index if not exists portfell_community_duels_day_idx
  on public.portfell_community_duels (community_id, day_key);

alter table public.portfell_community_duels enable row level security;

drop policy if exists "portfell_community_duels_select" on public.portfell_community_duels;
create policy "portfell_community_duels_select" on public.portfell_community_duels
  for select using (public.portfell_is_community_member(community_id));

drop policy if exists "portfell_community_duels_insert" on public.portfell_community_duels;
create policy "portfell_community_duels_insert" on public.portfell_community_duels
  for insert with check (
    user_id = auth.uid()
    and public.portfell_is_community_member(community_id)
  );

-- ===== 033_drop_lab_ghost_columns.sql =====
-- Lab only stores conviction. Journal, cashflow, paper arena, and badges
-- had no UI left and were still occupying columns (and getting empty
-- writes on insert). Drop them, and stop the claim function from
-- inserting ghosts onto new accounts.

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
  claim_slug text;
  pid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;
  primary_em := public.portfell_primary_email(em);

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

  for claim_slug in
    select portfolio_slug from public.portfell_seed_claims where email = em
  loop
    select id into pid from public.portfell_portfolios where portfell_portfolios.slug = claim_slug;
    if pid is null then
      continue;
    end if;

    update public.portfell_portfolios
    set owner_id = coalesce(owner_id, uid), updated_at = now()
    where id = pid;

    insert into public.portfell_portfolio_owners (portfolio_id, user_id)
    values (pid, uid)
    on conflict do nothing;

    claimed := array_append(claimed, claim_slug);
  end loop;

  insert into public.portfell_lab_state (id, owner_id, conviction, updated_at)
  values (uid::text, uid, '{}'::jsonb, now())
  on conflict (id) do update set owner_id = excluded.owner_id;

  return jsonb_build_object(
    'claimed', to_jsonb(claimed),
    'email', em,
    'primary_email', primary_em,
    'user_id', uid
  );
end;
$$;

alter table public.portfell_lab_state
  drop column if exists journal,
  drop column if exists cashflows,
  drop column if exists arena,
  drop column if exists badges;
