-- Daily / pre-delete book snapshots for Upside recovery
create table if not exists public.portfell_book_snapshots (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('nightly', 'pre_delete', 'manual')),
  label text not null default '',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists portfell_book_snapshots_created_idx
  on public.portfell_book_snapshots (created_at desc);

alter table public.portfell_book_snapshots enable row level security;

drop policy if exists "portfell_book_snapshots_all" on public.portfell_book_snapshots;
create policy "portfell_book_snapshots_all" on public.portfell_book_snapshots
  for all using (true) with check (true);
