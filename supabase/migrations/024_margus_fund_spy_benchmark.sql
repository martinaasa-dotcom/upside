-- Store SPY's price alongside each daily Upside Portfolio report so an
-- "equally-funded SPY" benchmark line can accumulate day-by-day, in lockstep
-- with Margus's own report history -- no separate historical backfill
-- needed since both start from the same inception date.
alter table public.portfell_margus_fund_reports
  add column if not exists spy_price numeric(14, 4);
