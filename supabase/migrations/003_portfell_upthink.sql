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
