-- Per-sheet access secret (PIN or password). NULL = use book default UPSIDE_OWNER_PIN.
alter table public.portfell_portfolios
  add column if not exists access_secret_hash text;

comment on column public.portfell_portfolios.access_secret_hash is
  'scrypt hash of sheet PIN/password; null means book default UPSIDE_OWNER_PIN';
