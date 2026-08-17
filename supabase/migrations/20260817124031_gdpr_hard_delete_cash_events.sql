-- GDPR hard-delete: cash ledger, snapshot/error scrub, profile-delete trigger.
-- Additive. CREATE OR REPLACE on existing functions. New table is empty, so
-- its indexes do not need CONCURRENTLY.

create table if not exists public.portfell_cash_events (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfell_portfolios(id) on delete cascade,
  user_id uuid references public.portfell_profiles(id) on delete set null,
  delta numeric(14, 2) not null,
  balance_after numeric(14, 2) not null,
  created_at timestamptz not null default now()
);

create index if not exists portfell_cash_events_portfolio_created_idx
  on public.portfell_cash_events (portfolio_id, created_at desc);

create index if not exists portfell_cash_events_user_idx
  on public.portfell_cash_events (user_id)
  where user_id is not null;

comment on table public.portfell_cash_events is
  'Paper-cash and explicit cash moves. Cascades with the sheet. user_id is null for service-role writes and after the actor is deleted.';

alter table public.portfell_cash_events enable row level security;

drop policy if exists portfell_cash_events_select on public.portfell_cash_events;
create policy portfell_cash_events_select
  on public.portfell_cash_events
  for select
  using (public.portfell_is_portfolio_co_owner(portfolio_id));

revoke all on table public.portfell_cash_events from anon, public, authenticated;
grant select on table public.portfell_cash_events to authenticated;
grant all on table public.portfell_cash_events to service_role;

-- Log every non-zero cash move next to the atomic balance update.
create or replace function public.portfell_apply_cash_delta(
  p_portfolio_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
set statement_timeout = '8s'
set idle_in_transaction_session_timeout = '5s'
as $$
declare
  next_balance numeric;
  uid uuid := auth.uid();
  rounded numeric;
begin
  if p_portfolio_id is null then
    raise exception 'portfolio id required';
  end if;

  if uid is not null and not public.portfell_is_portfolio_co_owner(p_portfolio_id) then
    raise exception 'not a co-owner of this portfolio';
  end if;

  if p_delta is null or p_delta = 0 then
    select cash_balance into next_balance
    from public.portfell_portfolios
    where id = p_portfolio_id;
    return next_balance;
  end if;

  rounded := round(p_delta::numeric, 2);

  update public.portfell_portfolios
  set cash_balance = round(
        (coalesce(cash_balance, 0) + rounded)::numeric, 2
      ),
      updated_at = now()
  where id = p_portfolio_id
  returning cash_balance into next_balance;

  if next_balance is null then
    raise exception 'portfolio not found';
  end if;

  insert into public.portfell_cash_events (
    portfolio_id, user_id, delta, balance_after
  ) values (
    p_portfolio_id, uid, rounded, next_balance
  );

  return next_balance;
end;
$$;

revoke all on function public.portfell_apply_cash_delta(uuid, numeric)
  from anon, public, authenticated;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric)
  to service_role;

-- Strip solely-owned sheets out of historical nightly/manual snapshots.
create or replace function public.portfell_scrub_snapshot_payload(
  p_payload jsonb,
  p_ids uuid[]
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  id_text text[];
  ports jsonb;
  holds jsonb;
  marks jsonb;
  nav jsonb;
  pid uuid;
begin
  if p_payload is null or p_ids is null or cardinality(p_ids) = 0 then
    return p_payload;
  end if;

  select array_agg(x::text) into id_text from unnest(p_ids) as x;
  if id_text is null then
    return p_payload;
  end if;

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into ports
  from jsonb_array_elements(coalesce(p_payload->'portfolios', '[]'::jsonb)) elem
  where not ((elem->>'id') = any (id_text));

  select coalesce(jsonb_agg(elem), '[]'::jsonb)
    into holds
  from jsonb_array_elements(coalesce(p_payload->'holdings', '[]'::jsonb)) elem
  where not ((elem->>'portfolio_id') = any (id_text));

  p_payload := jsonb_set(p_payload, '{portfolios}', ports, true);
  p_payload := jsonb_set(p_payload, '{holdings}', holds, true);

  marks := p_payload->'marks';
  if marks is not null and jsonb_typeof(marks) = 'object' then
    nav := marks->'navByPortfolio';
    if nav is not null and jsonb_typeof(nav) = 'object' then
      foreach pid in array p_ids loop
        nav := nav - pid::text;
      end loop;
      marks := jsonb_set(marks, '{navByPortfolio}', nav, true);
      p_payload := jsonb_set(p_payload, '{marks}', marks, true);
    end if;
  end if;

  return p_payload;
end;
$$;

revoke all on function public.portfell_scrub_snapshot_payload(jsonb, uuid[])
  from public, anon, authenticated;

-- Idempotent user-data wipe. Safe to run from the RPC and again from the
-- profile BEFORE DELETE trigger (auth.users cascade lands here too).
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
  end if;
end;
$$;

revoke all on function public.portfell_purge_user_data(uuid)
  from public, anon, authenticated;

create or replace function public.portfell_before_delete_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.portfell_purge_user_data(old.id);
  return old;
end;
$$;

revoke all on function public.portfell_before_delete_profile()
  from public, anon, authenticated;

drop trigger if exists portfell_profiles_before_delete on public.portfell_profiles;
create trigger portfell_profiles_before_delete
  before delete on public.portfell_profiles
  for each row
  execute function public.portfell_before_delete_profile();

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
      deleted_portfolios := array_append(deleted_portfolios, rec.name);
    else
      kept_portfolios := array_append(kept_portfolios, rec.name);
    end if;
  end loop;

  -- Profile delete fires portfell_before_delete_profile, which purges
  -- sole-owned sheets, cash events, snapshots, error-log PII, and empty
  -- circles. Shared sheets stay for the other owner(s).
  delete from public.portfell_profiles where id = uid;

  return jsonb_build_object(
    'deleted_portfolios', to_jsonb(deleted_portfolios),
    'left_shared_portfolios', to_jsonb(kept_portfolios)
  );
end;
$$;

revoke all on function public.portfell_delete_my_account() from public, anon;
grant execute on function public.portfell_delete_my_account() to authenticated;
