-- Self-service account deletion (GDPR-style "right to erasure" for app data).
--
-- Runs as security definer but is strictly self-scoped to auth.uid() — a
-- caller can never touch anyone else's rows. Leans on the FK cascades that
-- already exist (portfell_holdings/portfell_portfolio_owners -> portfolios
-- on delete cascade; portfell_lab_state/portfell_community_members ->
-- portfell_profiles on delete cascade) so most cleanup happens for free.
--
-- Note: this cannot delete the underlying auth.users row (needs the
-- service-role admin API, which this project doesn't run with in prod). The
-- account can still sign back in afterwards, but lands as a brand-new user
-- with none of their old data — the API route and UI copy are explicit
-- about this limitation.
create or replace function public.portfell_delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  deleted_portfolios text[] := '{}';
  kept_portfolios text[] := '{}';
  rec record;
  owner_count int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  for rec in
    select po.portfolio_id, p.name
    from public.portfell_portfolio_owners po
    join public.portfell_portfolios p on p.id = po.portfolio_id
    where po.user_id = uid
  loop
    select count(*) into owner_count
    from public.portfell_portfolio_owners
    where portfolio_id = rec.portfolio_id;

    if owner_count <= 1 then
      -- Sole owner: delete the sheet outright. Cascades take care of
      -- portfell_holdings, portfell_portfolio_owners, portfell_portfolio_invites,
      -- and portfell_community_portfolios rows tied to it.
      delete from public.portfell_portfolios where id = rec.portfolio_id;
      deleted_portfolios := array_append(deleted_portfolios, rec.name);
    else
      -- Shared sheet: leave it for the other owner(s). This user's row in
      -- portfell_portfolio_owners is cleaned up below by the profile delete.
      kept_portfolios := array_append(kept_portfolios, rec.name);
    end if;
  end loop;

  -- Cascades from here: remaining portfell_portfolio_owners rows (shared
  -- sheets), portfell_lab_state, portfell_community_members. Communities
  -- this user created keep existing (created_by -> set null) so co-members
  -- aren't affected.
  delete from public.portfell_profiles where id = uid;

  return jsonb_build_object(
    'deleted_portfolios', to_jsonb(deleted_portfolios),
    'left_shared_portfolios', to_jsonb(kept_portfolios)
  );
end;
$$;

revoke all on function public.portfell_delete_my_account() from public;
grant execute on function public.portfell_delete_my_account() to authenticated;
