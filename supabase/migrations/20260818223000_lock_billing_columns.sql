-- CRITICAL: portfell_profiles_update ("using id = auth.uid()") lets a
-- signed-in user PATCH their own profile row over PostgREST with the public
-- anon key + their own session -- there is no column-level restriction, so
-- nothing stopped a browser call like:
--   PATCH /rest/v1/portfell_profiles?id=eq.<self>
--   { "subscription_status": "active" }
-- from self-granting "active" (or any other) billing state, bypassing
-- Stripe entirely. The comment in src/app/api/billing/webhook/route.ts says
-- "the app never trusts client-reported subscription state -- only this
-- webhook writes these columns", but nothing in the database enforced that.
--
-- A plain column-level REVOKE would not actually help here: `authenticated`
-- holds its UPDATE privilege at the whole-table level (Supabase's default
-- privileges for every new table), and Postgres ORs table-level and
-- column-level grants -- revoking a column grant that was never the one in
-- effect changes nothing. A trigger is the reliable way to make specific
-- columns write-once-by-service-role regardless of table grants.
--
-- Same "auth.uid() is null means this is the service-role connection"
-- idiom already used in portfell_apply_cash_delta (migration 054):
-- service-role requests carry no user JWT, so auth.uid() is null; every
-- authenticated user request has a non-null auth.uid(). Both the webhook
-- and (in every deployed environment) the checkout/portal routes write via
-- the service-role client, so this does not change any real write path.

create or replace function public.portfell_profiles_guard_billing_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service-role connections (webhook, checkout, portal) carry no user JWT.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.stripe_customer_id is not null
      or new.stripe_subscription_id is not null
      or new.subscription_status is not null
      or new.plan is not null
      or new.current_period_end is not null
    then
      raise exception 'Billing fields can only be set by the billing webhook';
    end if;
    return new;
  end if;

  if new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.subscription_status is distinct from old.subscription_status
    or new.plan is distinct from old.plan
    or new.current_period_end is distinct from old.current_period_end
  then
    raise exception 'Billing fields can only be changed by the billing webhook';
  end if;

  return new;
end;
$$;

drop trigger if exists portfell_profiles_guard_billing_columns
  on public.portfell_profiles;
create trigger portfell_profiles_guard_billing_columns
  before insert or update on public.portfell_profiles
  for each row
  execute function public.portfell_profiles_guard_billing_columns();

revoke all on function public.portfell_profiles_guard_billing_columns()
  from public, anon, authenticated;
