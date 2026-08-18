/**
 * Client-safe Stripe subscription status helpers. No `stripe` import here on
 * purpose -- this file is used from client components (UpgradeButton,
 * AccountPage) as well as the server routes, and the `stripe` package is
 * server-only.
 */

/** Stripe is still charging (or trying to charge) this customer. */
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isActiveSubscription(status: string | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.has(status);
}

/**
 * Has a subscription, but the last charge failed and Stripe is retrying.
 * (Not `unpaid`/`incomplete`: those mean no successful payment ever
 * happened, so the plain "Upgrade" -> new Checkout flow is the right
 * recovery path, not a portal visit to fix a card on a sub that never
 * really started.)
 */
export function subscriptionNeedsAttention(status: string | null | undefined): boolean {
  return status === "past_due";
}
