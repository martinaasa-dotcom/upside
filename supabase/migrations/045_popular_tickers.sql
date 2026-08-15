-- Monthly snapshot of the 30 most-watched US names. Onboarding reads this.
-- Written by /api/cron/popular-tickers (1st of the month) via service role.

create table public.portfell_popular_tickers (
  month text primary key,
  tickers jsonb not null,
  updated_at timestamptz not null default now(),
  constraint portfell_popular_tickers_month_chk check (month ~ '^\d{4}-\d{2}$')
);

comment on table public.portfell_popular_tickers is
  'One row per calendar month. The 30 names shown when someone picks a watchlist during onboarding.';

alter table public.portfell_popular_tickers enable row level security;

revoke all on table public.portfell_popular_tickers from anon, public, authenticated;
grant select, insert, update, delete on table public.portfell_popular_tickers to service_role;
