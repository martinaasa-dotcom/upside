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

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (customerId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        await syncSubscription(customerId, subscription);
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      await syncSubscription(customerId, subscription);
      break;
    }

    default:
      // Not a status-changing event we care about -- ack and move on.
      break;
  }

  return NextResponse.json({ received: true });

  async function syncSubscription(customerId: string, subscription: Stripe.Subscription) {
    const { error } = await supabase!
      .from(PORTFELL_TABLES.profiles)
      .update(stripeSubscriptionFields(subscription))
      .eq("stripe_customer_id", customerId);

    if (error) {
      logEvent(
        "stripe_webhook_sync_failed",
        { customerId, message: error.message },
        "error"
      );
    }
  }
}

export const POST = observeRoute(handlePOST, "/api/billing/webhook");
