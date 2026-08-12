-- Self-hosted error log (no new third-party account needed) so a broken
-- deploy or unhandled exception shows up somewhere durable and visible
-- instead of only being caught by a user reporting it live, or a manual
-- Postgres-log dig like the service-role-key incident on 2026-08-12.
--
-- Open insert mirrors the portfell_book_snapshots precedent (017/020):
-- write-only, no payload exposed on list, so letting anyone/anon insert is
-- low-risk and means error reporting still works pre-login (sign-in screen
-- errors) and from instrumentation.ts (which runs outside a user session).
-- Read stays superadmin-only.
create table if not exists public.portfell_error_log (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('client', 'server')),
  message text not null,
  stack text,
  digest text,
  path text,
  route_type text,
  user_id uuid,
  user_email text,
  user_agent text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists portfell_error_log_created_idx
  on public.portfell_error_log (created_at desc);

alter table public.portfell_error_log enable row level security;

drop policy if exists "portfell_error_log_insert" on public.portfell_error_log;
create policy "portfell_error_log_insert" on public.portfell_error_log
  for insert with check (true);

drop policy if exists "portfell_error_log_select" on public.portfell_error_log;
create policy "portfell_error_log_select" on public.portfell_error_log
  for select using (public.portfell_is_superadmin());

drop policy if exists "portfell_error_log_delete" on public.portfell_error_log;
create policy "portfell_error_log_delete" on public.portfell_error_log
  for delete using (public.portfell_is_superadmin());
