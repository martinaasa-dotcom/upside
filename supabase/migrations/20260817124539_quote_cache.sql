-- Last-known market prints for failover when Yahoo / Twelve Data / Finnhub
-- are rate-limited or down. Service role only. Not user data.

create table public.portfell_quote_cache (
  ticker text primary key,
  quote jsonb not null,
  quoted_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint portfell_quote_cache_ticker_chk check (
    char_length(ticker) between 1 and 24
  )
);

comment on table public.portfell_quote_cache is
  'Durable last-known quotes. Written after a live fetch; read when the price feed is down.';

alter table public.portfell_quote_cache enable row level security;

revoke all on table public.portfell_quote_cache from anon, public, authenticated;
grant select, insert, update, delete on table public.portfell_quote_cache to service_role;
