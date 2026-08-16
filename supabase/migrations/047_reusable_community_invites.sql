-- Open community links stay live. Anyone with the token can join until
-- the admin revokes it or sets expires_at. Email-locked invites stay
-- one person, claimed in the same UPDATE so two people cannot spend them.

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

  -- Personal invite: one use, claimed here.
  update public.portfell_community_invites
  set accepted_at = now()
  where token_hash = p_token_hash
    and email is not null
    and revoked_at is null
    and accepted_at is null
    and (expires_at is null or expires_at > now())
    and lower(email) = em
  returning * into inv;

  if inv.id is null then
    -- Open link: reusable. Token possession is the grant.
    select * into inv
    from public.portfell_community_invites
    where token_hash = p_token_hash
      and email is null
      and revoked_at is null
      and (expires_at is null or expires_at > now());
  end if;

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

-- Old open links were burned after the first join and given a silent
-- 14-day timer. Bring those back. Email-locked rows stay as they are.
update public.portfell_community_invites
set accepted_at = null,
    expires_at = null
where email is null
  and revoked_at is null;
