"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/format";
import { isActiveSubscription } from "@/lib/billing-status";
import { plainError } from "@/lib/plain-error";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

/**
 * Header-level "Upgrade" entry point. The Account page has always had the
 * real Billing card, but that only reaches someone who already went
 * looking for it — this is the same offer, surfaced where every
 * signed-in page can see it, without turning into a nagging banner: a
 * small pill, hidden entirely for anyone already subscribed.
 */
export function UpgradeNudge({
  variant = "pill",
}: {
  /** pill = icon + "Upgrade" text (desktop header). icon = icon-only
   * button, for the mobile top bar where a text pill would crowd the
   * brand/title/avatar row. */
  variant?: "pill" | "icon";
}) {
  const { user } = useAuth();
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    const ctrl = new AbortController();
    void fetch("/api/billing/status", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { subscriptionStatus?: string | null } | null) => {
        if (ctrl.signal.aborted) return;
        setStatus(data?.subscriptionStatus ?? null);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setStatus(null);
      });
    return () => ctrl.abort();
  }, [user]);

  if (!user || status === undefined || isActiveSubscription(status)) {
    return null;
  }

  async function startCheckout() {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(plainError(data.error, "Couldn't open billing right now."));
        return;
      }
      window.location.href = data.url;
    } catch {
      toast.error("Couldn't reach billing right now.");
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Upgrade to Pro"
            title="Upgrade to Pro"
            className="text-primary hover:text-primary"
          >
            <Sparkles />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "gap-1.5 border-primary/30 bg-primary/10 text-primary",
              "hover:bg-primary/20 hover:text-primary"
            )}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Upgrade
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <span
            className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary"
            aria-hidden
          >
            <Sparkles className="size-5" />
          </span>
          <DialogTitle className="mt-1">Upside Lab Pro</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            Upgrading to Pro gets you nothing new (literally, not a single
            feature), but it does come with the smell of fresh coffee in the
            morning, flipping to the cool side of the pillow, and a small army
            of imaginary puppies. On a serious note, it&apos;s twelve euros a
            month to directly support Upside making this. Pretty solid deal.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-start">
          <Button
            type="button"
            onClick={() => void startCheckout()}
            disabled={checkingOut}
            className="w-full sm:w-auto"
          >
            {checkingOut ? "One sec…" : "Continue to checkout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
