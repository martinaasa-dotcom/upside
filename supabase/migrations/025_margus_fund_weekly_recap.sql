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
