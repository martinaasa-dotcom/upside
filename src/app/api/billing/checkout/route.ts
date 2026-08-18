import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { getStripe, stripeErrorMessage, stripePriceId } from "@/lib/stripe";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/**
 * Starts a Stripe-hosted Checkout session for the signed-in user and
 * returns the URL to redirect to. Reuses an existing Stripe customer if
 * this profile already has one (e.g. a lapsed subscriber resubscribing).
 *
 * Tax: automatic_tax + tax_id_collection are on so Stripe applies OSS VAT
 * for EU consumers and reverse charge (0%) for buyers with a valid EU
 * business VAT ID -- matches the Upthink Solutions OU OSS registration.
 */
async function handlePOST(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const stripe = getStripe();
  const priceId = stripePriceId();
  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Billing isn't configured yet" },
      { status: 400 }
    );
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("stripe_customer_id, email")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  let customerId = profile?.stripe_customer_id ?? undefined;

  try {
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? auth.user.email ?? undefined,
        metadata: { supabase_user_id: auth.user.id },
      });
      customerId = customer.id;

      const { error: saveError } = await supabase
        .from(PORTFELL_TABLES.profiles)
        .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
        .eq("id", auth.user.id);
      if (saveError) {
        return NextResponse.json({ error: saveError.message }, { status: 500 });
      }
    }

    const origin = new URL(req.url).origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      automatic_tax: { enabled: true },
      // Every Customer we create starts with no address. Without this,
      // automatic_tax rejects the session up front instead of using the
      // address the buyer is about to enter in Checkout.
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
      billing_address_collection: "required",
      success_url: `${origin}/account?upgraded=1`,
      cancel_url: `${origin}/account`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe didn't return a checkout URL" }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json({ error: stripeErrorMessage(err) }, { status: 502 });
  }
}

export const POST = observeRoute(handlePOST, "/api/billing/checkout");
