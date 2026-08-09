-- Optional manual Stock Target override (null = use resistance model)
alter table public.holdings
  add column if not exists stock_target_override numeric(12, 4);
