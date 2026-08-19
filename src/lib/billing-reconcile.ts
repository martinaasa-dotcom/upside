import { getStripe, stripeSubscriptionFields, CLEARED_BILLING_PATCH } from "@/lib/stripe";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { logEvent } from "@/lib/telemetry";

export type BillingReconcileResult = {
  status?: number;
  checked: number;
  corrected: number;
  error?: string;
};

/**
 * Self-healing backstop for the Stripe webhook. The webhook is the only
 * writer of these columns in normal operation, but Stripe does not
 * guarantee delivery -- an endpoint outage, a Vercel deploy mid-event, or a
 * dropped retry can leave `portfell_profiles.subscription_status` stale.
 * Nothing gates on that value today (Pro unlocks nothing), so drift is
 * silent rather than user-visible, which is exactly the condition under
 * which it can go unnoticed for a long time. This walks every profile that
 * has a Stripe customer and re-derives its status from Stripe directly,
 * the same source of truth the webhook itself trusts.
 */
export async function reconcileBillingSubscriptions(): Promise<BillingReconcileResult> {
  const stripe = getStripe();
  if (!stripe) {
    return { status: 400, checked: 0, corrected: 0, error: "Stripe not configured" };
  }
  const supabase = getSupabaseServer();
  if (!supabase) {
    return { status: 500, checked: 0, corrected: 0, error: "Supabase not configured" };
  }

  const { data: profiles, error } = await supabase
    .from(PORTFELL_TABLES.profiles)
    .select("id, stripe_customer_id, stripe_subscription_id, subscription_status")
    .not("stripe_customer_id", "is", null);

  if (error) {
    logEvent("billing_reconcile_query_failed", { message: error.message }, "error");
    return { status: 500, checked: 0, corrected: 0, error: error.message };
  }

  const rows = (profiles ?? []) as {
    id: string;
    stripe_customer_id: string;
    stripe_subscription_id: string | null;
    subscription_status: string | null;
  }[];

  let corrected = 0;

  for (const row of rows) {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: row.stripe_customer_id,
        status: "all",
        limit: 1,
      });
      const subscription = subscriptions.data[0];

      if (!subscription) {
        // Customer exists in Stripe but has never had (or no longer has any
        // record of) a subscription. Only clear local state if we actually
        // thought there was one -- an empty list here is also what a
        // customer created but never checked out looks like.
        if (row.subscription_status != null) {
          const { error: clearErr } = await supabase
            .from(PORTFELL_TABLES.profiles)
            .update(CLEARED_BILLING_PATCH)
            .eq("id", row.id);
          if (clearErr) {
            logEvent(
              "billing_reconcile_write_failed",
              { profileId: row.id, message: clearErr.message },
              "error"
            );
            continue;
          }
          corrected += 1;
          logEvent("billing_reconcile_corrected", {
            profileId: row.id,
            from: row.subscription_status,
            to: null,
          });
        }
        continue;
      }

      const fields = stripeSubscriptionFields(subscription);
      const drifted =
        row.subscription_status !== fields.subscription_status ||
        row.stripe_subscription_id !== fields.stripe_subscription_id;

      if (drifted) {
        const { error: writeErr } = await supabase
          .from(PORTFELL_TABLES.profiles)
          .update(fields)
          .eq("id", row.id);
        if (writeErr) {
          logEvent(
            "billing_reconcile_write_failed",
            { profileId: row.id, message: writeErr.message },
            "error"
          );
          continue;
        }
        corrected += 1;
        logEvent("billing_reconcile_corrected", {
          profileId: row.id,
          from: row.subscription_status,
          to: fields.subscription_status,
        });
      }
    } catch (err) {
      logEvent(
        "billing_reconcile_stripe_error",
        {
          profileId: row.id,
          message: err instanceof Error ? err.message : String(err),
        },
        "error"
      );
    }
  }

  return { checked: rows.length, corrected };
}
