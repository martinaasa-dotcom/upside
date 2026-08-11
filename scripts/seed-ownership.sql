-- One-shot seed ownership claim (Upthink Platform).
-- Martin: Aasad / Anu / MaryAnn. Karud & Lap stay unclaimed until their emails
-- are inserted into portfell_seed_claims and they sign in (or run an analogous update).

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

update public.portfell_portfolios p
set owner_id = u.id,
    updated_at = now()
from auth.users u
where lower(u.email) = 'martin.aasa@upthink.ee'
  and p.slug in ('aasad', 'anu', 'maryann')
  and (p.owner_id is null or p.owner_id = u.id);

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

update public.portfell_communities c
set created_by = u.id, updated_at = now()
from auth.users u
where lower(u.email) = 'martin.aasa@upthink.ee'
  and c.id = 'a0000000-0000-4000-8000-000000000001'::uuid
  and (c.created_by is null or c.created_by = u.id);

-- Optional: after you know Karud/Lap Google emails, add seed rows then they claim on login:
-- insert into public.portfell_seed_claims (email, portfolio_slug) values
--   ('karud@example.com', 'karud'),
--   ('lap@example.com', 'lap')
-- on conflict do nothing;
