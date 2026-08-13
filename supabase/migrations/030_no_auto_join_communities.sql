-- Stop auto-joining anyone to Upside Circle (or any community) on sign-in.
-- portfell_claim_seed_for_me() only auto-joined seed-claimed family members
-- (or the hardcoded admin email), but the app-code path in
-- ensure-profile.ts auto-joined *every* signed-in user unconditionally —
-- meaning any stranger creating an account got silently added to Upside
-- Circle and granted read access to the family's books (and vice versa).
-- Community membership is now opt-in only: an invite link for private
-- communities, or a request an admin approves for public ones. Seed
-- portfolio *ownership* claiming (unrelated to community membership) is
-- untouched below.
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
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;
  primary_em := public.portfell_primary_email(em);

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

  return jsonb_build_object(
    'claimed', to_jsonb(claimed),
    'email', em,
    'primary_email', primary_em,
    'user_id', uid
  );
end;
$$;
