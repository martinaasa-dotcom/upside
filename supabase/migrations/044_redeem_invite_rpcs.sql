-- Invite redeem lived only in the API. The SECURITY DEFINER functions it
-- called were never created, so every join-by-link returned 500.
--
-- Token possession is the grant. The redeemer is not a member/owner yet,
-- so RLS cannot authorize the lookup. Claim the invite row in one UPDATE
-- so two people cannot spend the same code.

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

  update public.portfell_community_invites
  set accepted_at = now()
  where token_hash = p_token_hash
    and revoked_at is null
    and accepted_at is null
    and (expires_at is null or expires_at > now())
    and (email is null or lower(email) = em)
  returning * into inv;

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

create or replace function public.portfell_redeem_portfolio_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  em text;
  inv public.portfell_portfolio_invites;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_token_hash is null or length(trim(p_token_hash)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'Invalid invite');
  end if;

  select lower(email) into em from auth.users where id = uid;

  update public.portfell_portfolio_invites
  set accepted_at = now()
  where token_hash = p_token_hash
    and revoked_at is null
    and accepted_at is null
    and (expires_at is null or expires_at > now())
    and (email is null or lower(email) = em)
  returning * into inv;

  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid invite');
  end if;

  insert into public.portfell_portfolio_owners (portfolio_id, user_id)
  values (inv.portfolio_id, uid)
  on conflict (portfolio_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'portfolio_id', inv.portfolio_id);
end;
$$;

revoke all on function public.portfell_redeem_community_invite(text) from public, anon;
revoke all on function public.portfell_redeem_portfolio_invite(text) from public, anon;
grant execute on function public.portfell_redeem_community_invite(text) to authenticated;
grant execute on function public.portfell_redeem_portfolio_invite(text) to authenticated;

-- Advisor wants (select auth.jwt()), not (select auth.jwt() ->> 'email').
drop policy if exists portfell_community_invites_select
  on public.portfell_community_invites;
create policy portfell_community_invites_select
  on public.portfell_community_invites
  for select
  using (
    portfell_is_community_admin(community_id)
    or (
      email is not null
      and ((select auth.jwt()) ->> 'email') is not null
      and lower(email) = lower((select auth.jwt()) ->> 'email')
    )
  );

drop policy if exists portfell_portfolio_invites_select
  on public.portfell_portfolio_invites;
create policy portfell_portfolio_invites_select
  on public.portfell_portfolio_invites
  for select
  using (
    portfell_is_portfolio_co_owner(portfolio_id)
    or (
      email is not null
      and ((select auth.jwt()) ->> 'email') is not null
      and lower(email) = lower((select auth.jwt()) ->> 'email')
    )
  );
