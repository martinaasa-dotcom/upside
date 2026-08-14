-- Shared Daily Duel picks inside a community. One pick per member per
-- Tallinn day. Pair is stored on the first insert so later holdings
-- changes cannot rewrite today's matchup.

create table if not exists public.portfell_community_duels (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  day_key text not null,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  ticker_a text not null,
  ticker_b text not null,
  pick text not null check (pick in ('a', 'b')),
  created_at timestamptz not null default now(),
  unique (community_id, day_key, user_id)
);

create index if not exists portfell_community_duels_day_idx
  on public.portfell_community_duels (community_id, day_key);

alter table public.portfell_community_duels enable row level security;

drop policy if exists "portfell_community_duels_select" on public.portfell_community_duels;
create policy "portfell_community_duels_select" on public.portfell_community_duels
  for select using (public.portfell_is_community_member(community_id));

drop policy if exists "portfell_community_duels_insert" on public.portfell_community_duels;
create policy "portfell_community_duels_insert" on public.portfell_community_duels
  for insert with check (
    user_id = auth.uid()
    and public.portfell_is_community_member(community_id)
  );
