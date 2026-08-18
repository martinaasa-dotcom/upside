import Stripe from "stripe";

let cached: Stripe | null = null;

/**
 * Server-only Stripe client. Null when STRIPE_SECRET_KEY isn't set, same
 * "feature quietly off" convention as getSupabaseServer() -- callers check
 * for null and 400 rather than throwing at import time.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return null;
  if (cached) return cached;
  cached = new Stripe(key);
  return cached;
}

/** The single subscription Price to sell at checkout. */
export function stripePriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ID?.trim() || undefined;
}

/** Secret used to verify webhook signatures -- never sent to the client. */
export function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined;
}

/**
 * A Stripe API error (bad key, inactive price, Stripe Tax not turned on in
 * the Dashboard, etc.) has a real, useful `.message`. Anything else is an
 * unexpected bug -- keep that generic rather than leaking internals.
 */
export function stripeErrorMessage(err: unknown): string {
  if (err instanceof Stripe.errors.StripeError) return err.message;
  return "Something went wrong talking to Stripe.";
}

/** Test-mode ids left on a live key (or the other way around) 404 like this. */
export function isMissingStripeCustomer(err: unknown): boolean {
  if (err instanceof Stripe.errors.StripeError) {
    return err.code === "resource_missing" || /no such customer/i.test(err.message);
  }
  if (!(err instanceof Error)) return false;
  return /no such customer/i.test(err.message);
}

export const CLEARED_BILLING_PATCH = {
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_status: null,
  plan: null,
  current_period_end: null,
} as const;

/** The portfell_profiles columns that mirror a Stripe subscription's state. */
export function stripeSubscriptionFields(subscription: Stripe.Subscription): {
  stripe_subscription_id: string;
  subscription_status: string;
  plan: string | null;
  current_period_end: string | null;
  updated_at: string;
} {
  const item = subscription.items.data[0];
  return {
    stripe_subscription_id: subscription.id,
    subscription_status: subscription.status,
    plan: item?.price?.nickname ?? item?.price?.lookup_key ?? null,
    current_period_end: item?.current_period_end
      ? new Date(item.current_period_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };
}
