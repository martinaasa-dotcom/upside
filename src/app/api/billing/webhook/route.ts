import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, stripeSubscriptionFields, stripeWebhookSecret } from "@/lib/stripe";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { observeRoute } from "@/lib/observe-route";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";
// Stripe's signature check needs Node's crypto, not the Edge runtime.
export const runtime = "nodejs";

/**
 * Single source of truth for subscription state: whatever Stripe says here
 * gets mirrored onto portfell_profiles. The app never trusts client-reported
 * subscription state -- only this webhook writes these columns.
 *
 * Register this endpoint in the Stripe Dashboard (or `stripe listen` for
 * local dev) pointed at POST /api/billing/webhook, subscribed to:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 */
async function handlePOST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = stripeWebhookSecret();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logEvent(
      "stripe_webhook_bad_signature",
      { message: err instanceof Error ? err.message : String(err) },
      "warn"
    );
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  // Whether every write this event needed actually landed. Stripe retries a
  // non-2xx for up to three days; acknowledging an event we failed to apply
  // throws that safety net away and leaves the mismatch to be found later,
  // by someone who has been charged and can see no sign of it.
  let applied = true;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (customerId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        applied = await syncSubscription(customerId, subscription);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      // Stripe does not guarantee webhook delivery order (retries and
      // network delays can land an older event after a newer one). Trusting
      // the subscription snapshot embedded in *this* event risks writing
      // stale state over a fresher update that already landed -- e.g. an
      // in-flight "updated: active" arriving after "deleted: canceled" would
      // silently resurrect a canceled subscription. Re-fetch by id instead,
      // same as the checkout.session.completed handler above: Stripe's API
      // always returns the current object, so every event for a given
      // subscription converges on the same (correct) write regardless of
      // delivery order.
      const eventSubscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof eventSubscription.customer === "string"
          ? eventSubscription.customer
          : eventSubscription.customer.id;
      const subscription = await stripe.subscriptions.retrieve(eventSubscription.id);
      applied = await syncSubscription(customerId, subscription);
      break;
    }

    default:
      // Not a status-changing event we care about -- ack and move on.
      break;
  }

  if (!applied) {
    // 500 so Stripe redelivers. The event is safe to replay: every handler
    // re-fetches the subscription by id and writes whatever Stripe says now,
    // so a retry converges on the same state rather than compounding.
    return NextResponse.json({ error: "Could not record subscription" }, { status: 500 });
  }

  return NextResponse.json({ received: true });

  /** True only if the profile row was actually written. */
  async function syncSubscription(
    customerId: string,
    subscription: Stripe.Subscription
  ): Promise<boolean> {
    const { error, count } = await supabase!
      .from(PORTFELL_TABLES.profiles)
      .update(stripeSubscriptionFields(subscription), { count: "exact" })
      .eq("stripe_customer_id", customerId);

    if (error) {
      logEvent(
        "stripe_webhook_sync_failed",
        { customerId, message: error.message },
        "error"
      );
      return false;
    }

    /*
     * An update that matches nothing is not an error in PostgREST -- it
     * succeeds having changed no rows. Without the count that is
     * indistinguishable from a write, so a payment for a customer id no
     * profile carries would look perfectly handled while the person stayed
     * un-upgraded. Ask Stripe to send it again: checkout saves the customer
     * id before it ever opens a session, so a row that is missing now is
     * usually a row that is about to exist.
     */
    if (count === 0) {
      logEvent(
        "stripe_webhook_sync_no_profile",
        { customerId, subscriptionId: subscription.id },
        "error"
      );
      return false;
    }

    return true;
  }
}

export const POST = observeRoute(handlePOST, "/api/billing/webhook");
