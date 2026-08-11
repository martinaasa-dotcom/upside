-- Allow signed-in users to claim seed portfolios without service role
create or replace function public.portfell_claim_seed_for_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em text;
  claimed text[] := '{}';
  slug text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into em from auth.users where id = uid;

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

  for slug in
    select portfolio_slug from public.portfell_seed_claims where email = em
  loop
    update public.portfell_portfolios
    set owner_id = uid, updated_at = now()
    where portfell_portfolios.slug = slug
      and (owner_id is null or owner_id = uid);
    if found then
      claimed := array_append(claimed, slug);
    end if;
  end loop;

  insert into public.portfell_lab_state (id, owner_id, conviction, journal, cashflows, arena, badges, updated_at)
  values (uid::text, uid, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, now())
  on conflict (id) do update set owner_id = excluded.owner_id;

  if exists (select 1 from public.portfell_seed_claims where email = em)
     or em = 'martin.aasa@upthink.ee' then
    insert into public.portfell_community_members (community_id, user_id, role)
    values (
      'a0000000-0000-4000-8000-000000000001'::uuid,
      uid,
      case when em = 'martin.aasa@upthink.ee' then 'admin' else 'member' end
    )
    on conflict (community_id, user_id) do nothing;

    if em = 'martin.aasa@upthink.ee' then
      update public.portfell_communities
      set created_by = uid, updated_at = now()
      where id = 'a0000000-0000-4000-8000-000000000001'::uuid
        and (created_by is null or created_by = uid);
    end if;
  end if;

  return jsonb_build_object('claimed', to_jsonb(claimed), 'email', em, 'user_id', uid);
end;
$$;

revoke all on function public.portfell_claim_seed_for_me() from public;
grant execute on function public.portfell_claim_seed_for_me() to authenticated;
