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
