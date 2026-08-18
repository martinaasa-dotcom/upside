"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isActiveSubscription } from "@/lib/billing-status";

/**
 * Drop into /account. Shows "Upgrade" for a free user, "Manage billing" for
 * anyone with an active/trialing/past_due subscription -- same button, two
 * destinations depending on `subscriptionStatus`. past_due counts as
 * subscribed so the destination is the portal (fix the card), not a second
 * Checkout session.
 */
export function UpgradeButton({
  subscriptionStatus,
}: {
  subscriptionStatus: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const isSubscribed = isActiveSubscription(subscriptionStatus);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(isSubscribed ? "/api/billing/portal" : "/api/billing/checkout", {
        method: "POST",
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Couldn't open billing right now.");
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Couldn't reach billing right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={handleClick} disabled={loading}>
      {loading ? "One sec…" : isSubscribed ? "Manage billing" : "Upgrade"}
    </Button>
  );
}
