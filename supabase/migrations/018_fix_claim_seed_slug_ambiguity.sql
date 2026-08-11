-- Fix long-standing bug: portfell_claim_seed_for_me() declared a PL/pgSQL
-- loop variable named `slug`, which collides with the portfell_portfolios.slug
-- column. Any bare reference to `slug` inside an embedded SQL statement raises
-- "column reference \"slug\" is ambiguous", aborting the whole function (and
-- rolling back everything it already did, including the profile upsert) before
-- it ever reaches the portfolio_owners insert. This has silently blocked EVERY
-- first-time seed claim since it was introduced (migration 010) for anyone not
-- manually seeded via scripts/seed-ownership.sql — confirmed via Postgres logs
-- showing this error on every single call, and reproduced live for Rasmus
-- (rasmusmarjapuu@gmail.com / Karud), who signed in but ended up with no
-- profile, no ownership row, and "No sheets in My book yet".
--
-- Applied to Upthink Platform via MCP; kept here for repo history.
create or replace function public.portfell_claim_seed_for_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text;
  primary_em text;
  claimed text[] := '{}';
  claim_slug text;
  pid uuid;
  is_admin boolean := false;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;
  primary_em := public.portfell_primary_email(em);
  is_admin := primary_em = 'martin.aasa@upthink.ee';

  insert into public.portfell_profiles (id, email, display_name, avatar_url, updated_at)
  select
    u.id,
    u.email,
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      split_part(coalesce(u.email, ''), '@', 1),
      'Investor'
    ),
    coalesce(
      nullif(u.raw_user_meta_data->>'avatar_url', ''),
      nullif(u.raw_user_meta_data->>'picture', '')
    ),
    now()
  from auth.users u
  where u.id = uid
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    avatar_url = excluded.avatar_url,
    updated_at = now();

  for claim_slug in
    select portfolio_slug from public.portfell_seed_claims where email = em
  loop
    select id into pid from public.portfell_portfolios where portfell_portfolios.slug = claim_slug;
    if pid is null then
      continue;
    end if;

    update public.portfell_portfolios
    set owner_id = coalesce(owner_id, uid), updated_at = now()
    where id = pid;

    insert into public.portfell_portfolio_owners (portfolio_id, user_id)
    values (pid, uid)
    on conflict do nothing;

    claimed := array_append(claimed, claim_slug);
  end loop;

  insert into public.portfell_lab_state (id, owner_id, conviction, journal, cashflows, arena, badges, updated_at)
  values (uid::text, uid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, now())
  on conflict (id) do update set owner_id = excluded.owner_id;

  if exists (select 1 from public.portfell_seed_claims where email = em)
     or is_admin then
    insert into public.portfell_community_members (community_id, user_id, role)
    values (
      'a0000000-0000-4000-8000-000000000001'::uuid,
      uid,
      case when is_admin then 'admin' else 'member' end
    )
    on conflict (community_id, user_id) do update
      set role = case
        when excluded.role = 'admin' then 'admin'
        else portfell_community_members.role
      end;

    if is_admin then
      update public.portfell_communities
      set created_by = coalesce(created_by, uid), updated_at = now()
      where id = 'a0000000-0000-4000-8000-000000000001'::uuid;
    end if;
  end if;

  return jsonb_build_object(
    'claimed', to_jsonb(claimed),
    'email', em,
    'primary_email', primary_em,
    'user_id', uid
  );
end;
$$;
