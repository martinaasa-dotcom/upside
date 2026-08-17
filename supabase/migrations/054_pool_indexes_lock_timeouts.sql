-- High-concurrency pass: cover the remaining unindexed FK and the
-- composite filters the hot paths actually use, then pin the cash RPC so
-- a waited-on row lock cannot hang a serverless isolate.
--
-- App traffic goes through PostgREST (transaction-mode pooler). These
-- indexes keep that path on index scans as the book grows past a page.
-- Seq scans on today's 11-54 row tables are still cheaper; that is fine.

create index if not exists portfell_community_invite_uses_user_idx
  on public.portfell_community_invite_uses (user_id);

create index if not exists portfell_profiles_email_lower_idx
  on public.portfell_profiles (lower(email))
  where email is not null;

create index if not exists portfell_book_snapshots_kind_created_idx
  on public.portfell_book_snapshots (kind, created_at desc);

create index if not exists portfell_join_requests_community_status_idx
  on public.portfell_community_join_requests (community_id, status, requested_at);

create index if not exists portfell_community_members_user_role_idx
  on public.portfell_community_members (user_id, role);

create index if not exists portfell_portfolios_classroom_idx
  on public.portfell_portfolios (classroom_community_id)
  where classroom_community_id is not null;

create index if not exists portfell_holdings_portfolio_sort_idx
  on public.portfell_holdings (portfolio_id, sort_order);

create index if not exists portfell_profiles_note_morning_idx
  on public.portfell_profiles (id)
  where note_morning = true;

create index if not exists portfell_profiles_note_sunday_idx
  on public.portfell_profiles (id)
  where note_sunday = true;

-- Fail fast if another writer holds the cash row. The UPDATE already
-- serializes deltas; without a lock timeout a stuck transaction would
-- pin PostgREST until statement_timeout (120s) and eat pooler slots.
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
begin
  if p_portfolio_id is null then
    raise exception 'portfolio id required';
  end if;

  -- uid is null for the service-role connection the API routes use; any other
  -- caller has to prove co-ownership of this sheet.
  if uid is not null and not public.portfell_is_portfolio_co_owner(p_portfolio_id) then
    raise exception 'not a co-owner of this portfolio';
  end if;

  if p_delta is null or p_delta = 0 then
    select cash_balance into next_balance
    from public.portfell_portfolios
    where id = p_portfolio_id;
    return next_balance;
  end if;

  update public.portfell_portfolios
  set cash_balance = round(
        (coalesce(cash_balance, 0) + round(p_delta::numeric, 2))::numeric, 2
      ),
      updated_at = now()
  where id = p_portfolio_id
  returning cash_balance into next_balance;

  return next_balance;
end;
$$;

revoke all on function public.portfell_apply_cash_delta(uuid, numeric)
  from anon, public, authenticated;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric)
  to service_role;
