-- One-shot / ops seed for co-ownership (Upthink Platform).
-- Multiple emails can map to the same portfolio_slug via portfell_seed_claims.

with u as (
  select id, email, raw_user_meta_data
  from auth.users
  where lower(email) = 'martin.aasa@upthink.ee'
  limit 1
)
insert into public.portfell_profiles (id, email, display_name, avatar_url, updated_at)
select
  u.id,
  u.email,
  coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(u.email, '@', 1)
  ),
  coalesce(
    nullif(u.raw_user_meta_data->>'avatar_url', ''),
    nullif(u.raw_user_meta_data->>'picture', '')
  ),
  now()
from u
on conflict (id) do update set
  email = excluded.email,
  display_name = excluded.display_name,
  avatar_url = excluded.avatar_url,
  updated_at = now();

-- Primary owner column (first claimant) + junction co-owner rows
update public.portfell_portfolios p
set owner_id = coalesce(p.owner_id, u.id),
    updated_at = now()
from auth.users u
where lower(u.email) = 'martin.aasa@upthink.ee'
  and p.slug in ('aasad', 'anu', 'maryann');

insert into public.portfell_portfolio_owners (portfolio_id, user_id)
select p.id, u.id
from public.portfell_portfolios p
cross join auth.users u
where lower(u.email) = 'martin.aasa@upthink.ee'
  and p.slug in ('aasad', 'anu', 'maryann')
on conflict do nothing;

insert into public.portfell_lab_state (id, owner_id, conviction, journal, cashflows, arena, badges, updated_at)
select u.id, u.id, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, now()
from auth.users u
where lower(u.email) = 'martin.aasa@upthink.ee'
on conflict (id) do update set owner_id = excluded.owner_id;

insert into public.portfell_community_members (community_id, user_id, role)
select 'a0000000-0000-4000-8000-000000000001'::uuid, u.id, 'admin'
from auth.users u
where lower(u.email) = 'martin.aasa@upthink.ee'
on conflict (community_id, user_id) do update set role = 'admin';

-- Co-own example: map a second email onto the same sheet
-- insert into public.portfell_seed_claims (email, portfolio_slug) values
--   ('partner@example.com', 'aasad')
-- on conflict do nothing;
-- Then partner signs in (claim RPC / ensureProfileAndClaims) or:
-- insert into public.portfell_portfolio_owners (portfolio_id, user_id)
-- select p.id, pr.id from portfell_portfolios p
-- join portfell_profiles pr on lower(pr.email) = 'partner@example.com'
-- where p.slug = 'aasad'
-- on conflict do nothing;

-- Karud co-owners (claim on first Google sign-in)
insert into public.portfell_seed_claims (email, portfolio_slug) values
  ('rasmusmarjapuu@gmail.com', 'karud'),
  ('karukaroliine99@gmail.com', 'karud')
on conflict do nothing;
