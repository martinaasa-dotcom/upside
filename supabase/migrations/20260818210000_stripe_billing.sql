-- Stripe subscription fields on portfell_profiles.
-- One customer / one subscription per user -- Upside Lab has no team
-- billing yet, so this stays on the existing profile row rather than
-- a separate table.

alter table public.portfell_profiles
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text,
  add column if not exists plan text,
  add column if not exists current_period_end timestamptz;

-- Webhook handler looks users up by Stripe customer id.
create unique index if not exists portfell_profiles_stripe_customer_id_idx
  on public.portfell_profiles (stripe_customer_id)
  where stripe_customer_id is not null;

comment on column public.portfell_profiles.subscription_status is
  'Mirrors the Stripe subscription status: active, trialing, past_due, '
  'canceled, incomplete, incomplete_expired, unpaid. Null = never subscribed.';

comment on column public.portfell_profiles.plan is
  'Free-form plan label mirrored from the Stripe Price nickname/lookup_key '
  'at checkout time (e.g. "pro_monthly"). Not used for entitlement checks -- '
  'subscription_status is.';
