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
