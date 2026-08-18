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
