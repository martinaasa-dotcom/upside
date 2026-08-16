-- Community invite email is an allowlist, not a one-person ticket.
-- Store one or more addresses in email (comma-separated). Anyone on
-- that list can join with the same link, as many times as needed.
-- Open links (email is null) stay open.

create or replace function public.portfell_redeem_community_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  em text;
  inv public.portfell_community_invites;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_token_hash is null or length(trim(p_token_hash)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'Invalid invite');
  end if;

  select lower(email) into em from auth.users where id = uid;

  select * into inv
  from public.portfell_community_invites
  where token_hash = p_token_hash
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (
      email is null
      or (
        em is not null
        and em = any(string_to_array(email, ','))
      )
    );

  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid invite');
  end if;

  insert into public.portfell_community_members (community_id, user_id, role)
  values (inv.community_id, uid, coalesce(nullif(inv.role, ''), 'member'))
  on conflict (community_id, user_id) do update
    set role = case
      when portfell_community_members.role = 'admin' then 'admin'
      else excluded.role
    end;

  return jsonb_build_object('ok', true, 'community_id', inv.community_id);
end;
$$;

revoke all on function public.portfell_redeem_community_invite(text) from public, anon;
grant execute on function public.portfell_redeem_community_invite(text) to authenticated;
