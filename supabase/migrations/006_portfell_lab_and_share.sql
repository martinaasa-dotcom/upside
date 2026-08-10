-- Shared Lab state + read-only share links for Upside (portfell_*)

create table if not exists public.portfell_lab_state (
  id text primary key default 'book',
  conviction jsonb not null default '{}'::jsonb,
  journal jsonb not null default '[]'::jsonb,
  cashflows jsonb not null default '[]'::jsonb,
  arena jsonb not null default '{}'::jsonb,
  badges jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.portfell_lab_state (id)
values ('book')
on conflict (id) do nothing;

create table if not exists public.portfell_share_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  label text not null default 'Guest link',
  scope text not null default 'overview'
    check (scope in ('overview', 'sheet', 'lab')),
  portfolio_id uuid references public.portfell_portfolios(id) on delete cascade,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portfell_share_links_token_idx
  on public.portfell_share_links(token_hash);

alter table public.portfell_lab_state enable row level security;
alter table public.portfell_share_links enable row level security;

drop policy if exists "portfell_lab_state_all" on public.portfell_lab_state;
drop policy if exists "portfell_share_links_all" on public.portfell_share_links;

-- Same open personal-book model as other portfell_* tables (PIN gates API writes).
create policy "portfell_lab_state_all" on public.portfell_lab_state
  for all using (true) with check (true);
create policy "portfell_share_links_all" on public.portfell_share_links
  for all using (true) with check (true);
