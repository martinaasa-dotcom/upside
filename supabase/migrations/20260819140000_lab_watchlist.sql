-- The Sunday letter suggests names off the reader's watchlist, so the
-- watchlist has to be readable by the cron, not only by the browser that
-- typed it. It rides along with the per-owner Lab state that already
-- syncs conviction notes.
alter table public.portfell_lab_state
  add column if not exists watchlist jsonb not null default '[]'::jsonb;

comment on column public.portfell_lab_state.watchlist is
  'Tickers the owner is watching but does not hold. Synced from the browser so the Sunday email can look at them.';
