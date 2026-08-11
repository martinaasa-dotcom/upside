-- Profile bio for community appearance + portfolio co-owner invite codes

alter table public.portfell_profiles
  add column if not exists bio text;

comment on column public.portfell_profiles.bio is
  'Short community blurb shown next to display_name';

create table if not exists public.portfell_portfolio_invites (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  token_hash text not null unique,
  email text,
  created_by uuid references public.portfell_profiles(id) on delete set null,
  expires_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists portfell_portfolio_invites_portfolio_idx
  on public.portfell_portfolio_invites(portfolio_id);

alter table public.portfell_portfolio_invites enable row level security;

drop policy if exists "portfell_portfolio_invites_select" on public.portfell_portfolio_invites;
drop policy if exists "portfell_portfolio_invites_write" on public.portfell_portfolio_invites;

create policy "portfell_portfolio_invites_select" on public.portfell_portfolio_invites
  for select using (
    public.portfell_is_portfolio_co_owner(portfolio_id)
    or lower(coalesce(email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

create policy "portfell_portfolio_invites_write" on public.portfell_portfolio_invites
  for all using (public.portfell_is_portfolio_co_owner(portfolio_id))
  with check (public.portfell_is_portfolio_co_owner(portfolio_id));
