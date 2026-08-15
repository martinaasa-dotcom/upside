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
-- land. Rounding happens here too, so the stored value can never drift into
-- fractional cents no matter which caller wrote it.
--
-- SECURITY DEFINER only so the function can run with a stable search_path and
-- be granted narrowly. It deliberately does NOT do its own permission check:
-- callers are API routes that have already established co-ownership via
-- requirePortfolioOwner(). Execute is granted to authenticated and
-- service_role only, never to anon.
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
begin
  if p_portfolio_id is null then
    raise exception 'portfolio id required';
  end if;
  if p_delta is null or p_delta = 0 then
    select cash_balance into next_balance
    from public.portfell_portfolios
    where id = p_portfolio_id;
    return next_balance;
  end if;

  update public.portfell_portfolios
  set cash_balance = round((coalesce(cash_balance, 0) + p_delta)::numeric, 2),
      updated_at = now()
  where id = p_portfolio_id
  returning cash_balance into next_balance;

  return next_balance;
end;
$$;

revoke all on function public.portfell_apply_cash_delta(uuid, numeric) from public;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric) to authenticated;
grant execute on function public.portfell_apply_cash_delta(uuid, numeric) to service_role;
