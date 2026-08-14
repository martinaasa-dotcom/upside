-- Public fund should say what undeployed cash is for, and which names
-- Margus is waiting on, not just what he already holds.
alter table public.portfell_margus_fund
  add column if not exists watchlist jsonb not null default '[]'::jsonb,
  add column if not exists cash_purpose text;
