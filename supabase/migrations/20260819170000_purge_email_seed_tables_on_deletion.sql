-- Pass 9 L2: portfell_household_groups, portfell_account_aliases, and
-- portfell_seed_claims are hardcoded, migration-seeded email allow-lists
-- with no foreign key to portfell_profiles, so self-service account
-- deletion and the profile BEFORE DELETE trigger never touched them.
--
-- Deferred at the time because the app was Martin's own family (a
-- handful of hardcoded rows, no ingestion path, real risk near zero).
-- That reasoning was specifically about the *content* of these tables --
-- AGENTS.md still guards that, and this migration does not add, remove,
-- or edit a single row of it. What has changed is that self-service
-- account deletion is now something real, non-family users do, and the
-- erasure path should be complete regardless of whether these three
-- tables currently hold anyone but Martin's household -- a person who
-- deletes their account should not have their email survive in a table
-- the deletion flow doesn't know about, even if that's unlikely today.
--
-- portfell_purge_user_data already resolves the deleting profile's email
-- (`em`) to scrub portfell_error_log; extend the same lookup to also
-- clear matching rows in the three email-keyed tables. Full CREATE OR
-- REPLACE since Postgres has no ALTER FUNCTION ... ADD statement --
-- everything below through the closing purge is byte-for-byte the
-- existing body from 20260817124031_gdpr_hard_delete_cash_events.sql,
-- with only the new block added at the end.

create or replace function public.portfell_purge_user_data(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_ids uuid[] := '{}';
  rec record;
  owner_count int;
  member_count int;
  admin_count int;
  promote_id uuid;
  em text;
begin
  if p_uid is null then
    return;
  end if;

  select email into em from public.portfell_profiles where id = p_uid;

  for rec in
    select po.portfolio_id
    from public.portfell_portfolio_owners po
    where po.user_id = p_uid
  loop
    select count(*) into owner_count
    from public.portfell_portfolio_owners
    where portfolio_id = rec.portfolio_id;

    if owner_count <= 1 then
      deleted_ids := array_append(deleted_ids, rec.portfolio_id);
      delete from public.portfell_portfolios where id = rec.portfolio_id;
    end if;
  end loop;

  -- Last admin of a circle that still has other people: hand the role off
  -- so the group is not stuck with nobody who can invite or delete it.
  for rec in
    select m.community_id
    from public.portfell_community_members m
    where m.user_id = p_uid and m.role = 'admin'
  loop
    select count(*) into member_count
    from public.portfell_community_members
    where community_id = rec.community_id
      and user_id is distinct from p_uid;

    if member_count = 0 then
      delete from public.portfell_communities where id = rec.community_id;
      continue;
    end if;

    select count(*) into admin_count
    from public.portfell_community_members
    where community_id = rec.community_id
      and role = 'admin'
      and user_id is distinct from p_uid;

    if admin_count = 0 then
      select user_id into promote_id
      from public.portfell_community_members
      where community_id = rec.community_id
        and user_id is distinct from p_uid
      order by joined_at asc
      limit 1;

      if promote_id is not null then
        update public.portfell_community_members
        set role = 'admin'
        where community_id = rec.community_id
          and user_id = promote_id;
      end if;
    end if;
  end loop;

  -- Circles where this person is the only remaining member, even if not admin.
  for rec in
    select m.community_id
    from public.portfell_community_members m
    where m.user_id = p_uid
  loop
    select count(*) into member_count
    from public.portfell_community_members
    where community_id = rec.community_id
      and user_id is distinct from p_uid;
    if member_count = 0 then
      delete from public.portfell_communities where id = rec.community_id;
    end if;
  end loop;

  if cardinality(deleted_ids) > 0 then
    update public.portfell_book_snapshots
    set payload = public.portfell_scrub_snapshot_payload(payload, deleted_ids);
  end if;

  delete from public.portfell_error_log where user_id = p_uid;
  if em is not null and length(trim(em)) > 0 then
    delete from public.portfell_error_log
    where lower(user_email) = lower(em);

    -- New: sweep the hardcoded email-keyed seed tables. A deleted
    -- account's email should not survive here just because these tables
    -- have no FK to enforce it. Whichever role the email played (a
    -- household member, an alias, a seed claim, or the primary account
    -- an alias pointed at) is removed with it.
    delete from public.portfell_household_groups
    where lower(email) = lower(em);

    delete from public.portfell_account_aliases
    where lower(alias_email) = lower(em)
      or lower(primary_email) = lower(em);

    delete from public.portfell_seed_claims
    where lower(email) = lower(em);
  end if;
end;
$$;

revoke all on function public.portfell_purge_user_data(uuid)
  from public, anon, authenticated;
