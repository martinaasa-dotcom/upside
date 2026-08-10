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
