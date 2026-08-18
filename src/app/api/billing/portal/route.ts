import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseDataClient } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { getStripe } from "@/lib/stripe";
import { observeRoute } from "@/lib/observe-route";

export const dynamic = "force-dynamic";

/**
 * Opens the Stripe-hosted Billing Portal for the signed-in user -- lets
 * them update their card, view invoices, or cancel. No custom UI needed
 * for any of that; Stripe hosts it.
 */
async function handlePOST(req: Request) {
  const auth = await requireAuthUser();
  if ("error" in auth) return auth.error;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 400 });
  }

  const supabase = await getSupabaseDataClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("stripe_customer_id")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No subscription on file" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${origin}/account`,
  });

  return NextResponse.json({ url: session.url });
}

export const POST = observeRoute(handlePOST, "/api/billing/portal");
