-- Drop sheet PIN/password and guest share links (auth = Google co-ownership only).

drop table if exists public.portfell_share_links;

alter table public.portfell_portfolios
  drop column if exists access_secret_hash;
