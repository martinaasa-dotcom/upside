-- Superadmin overview for Martin / Martina (email allowlist).
-- Works without service role: RPC is security definer and checks JWT email.

create or replace function public.portfell_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'martin.aasa@upthink.ee',
    'aasamartinaasa@gmail.com'
  );
$$;

revoke all on function public.portfell_is_superadmin() from public;
grant execute on function public.portfell_is_superadmin() to authenticated;

create or replace function public.portfell_superadmin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.portfell_is_superadmin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'email', p.email,
          'display_name', p.display_name,
          'avatar_url', p.avatar_url,
          'bio', p.bio,
          'profile_created_at', p.created_at,
          'profile_updated_at', p.updated_at,
          'last_sign_in_at', u.last_sign_in_at,
          'email_confirmed_at', u.email_confirmed_at
        )
        order by coalesce(u.last_sign_in_at, p.created_at) desc nulls last
      )
      from public.portfell_profiles p
      left join auth.users u on u.id = p.id
    ), '[]'::jsonb),
    'communities', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'created_by', c.created_by,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'member_count', (
            select count(*)::int
            from public.portfell_community_members m
            where m.community_id = c.id
          ),
          'members', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'user_id', m.user_id,
                'role', m.role,
                'joined_at', m.joined_at,
                'email', pr.email,
                'display_name', pr.display_name,
                'avatar_url', pr.avatar_url
              )
              order by
                case when m.role = 'admin' then 0 else 1 end,
                coalesce(pr.display_name, pr.email, '')
            )
            from public.portfell_community_members m
            left join public.portfell_profiles pr on pr.id = m.user_id
            where m.community_id = c.id
          ), '[]'::jsonb)
        )
        order by c.name
      )
      from public.portfell_communities c
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.portfell_superadmin_overview() from public;
grant execute on function public.portfell_superadmin_overview() to authenticated;
