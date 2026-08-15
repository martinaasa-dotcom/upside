-- Cash balances were being moved with a read-modify-write from the API layer:
-- applyPortfolioCashDelta() SELECTed cash_balance, added the delta in Node,
-- then UPDATEd the absolute result. Two writes landing together on the same
-- sheet both read the same starting balance and the second UPDATE overwrote
-- the first, so one of the two trades silently left the cash side behind.
--
-- That is not a rare race in this app. A co-owned sheet is the normal case,
-- the holdings import applies a batch of deltas, and the mobile client
-- retries a failed write, so two in-flight deltas on one sheet is ordinary
-- traffic rather than a thundering-herd edge case. Losing one is a real
-- money error a person then has to reconcile by hand.
--
-- Doing the arithmetic inside a single UPDATE makes it atomic: Postgres takes
-- a row lock for the duration, so concurrent callers queue and both deltas
-- land.
--
-- The delta is rounded to cents before it is added, not the running balance
-- after. Rounding the total compounds: Postgres round() breaks ties away from
-- zero, so +100.005 then -100.005 stored 100.01 and then 0.01 rather than
-- returning to 0. Rounding the delta keeps the invariant by induction -- a
-- balance exact to the cent plus a delta exact to the cent is exact to the
-- cent -- so nothing accumulates. The outer round() only cleans up a stored
-- value that was already sub-cent, and is a no-op on anything this function
-- wrote.
--
-- Half-away-from-zero matches roundMoney() in src/lib/money.ts, so a value
-- rounds the same on both sides of the wire.
--
-- The function checks co-ownership itself rather than trusting the API route
-- that calls it. It takes a portfolio id and an arbitrary amount, so a version
-- that skipped the check would let any caller who can reach PostgREST move any
-- sheet's cash by any amount given only its UUID — the same cross-tenant write
-- this pass set out to close, reintroduced one layer down. The API routes do
-- run their own requirePortfolioOwner check; this is the backstop for when
-- something reaches the function without going through them.
--
-- service_role bypasses the check because it carries no end-user JWT, so
-- auth.uid() is null for it: that is the app's own server-side path, which has
-- already established ownership.
create or replace function public.portfell_apply_cash_delta(
  p_portfolio_id uuid,
  p_delta numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
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

-- Supabase default-grants execute on new functions in `public` to anon, so
-- revoking from PUBLIC alone leaves anon holding the privilege. Name it
-- explicitly, the same way migration 035 had to.
revoke all on function public.portfell_apply_cash_delta(uuid, numeric)
  from anon, public;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric)
  to authenticated;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric)
  to service_role;
