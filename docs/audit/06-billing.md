# Pass 6 — Billing & subscriptions (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `b1e725f` (main, after Pass 5)

> Round 2 re-derivation. Nothing in the previous `06-billing.md` or its fix
> log was carried over as fact. Round 1's three High findings were re-tested
> independently; all three survived. The findings below are new.

**Headline:** 628 lines of money-handling code with **zero tests**, and
three defects that share one shape — *the system believes its own mirror of
Stripe over Stripe itself.* The webhook tells Stripe an event succeeded when
the write failed. The nightly repair job can overwrite a paying customer's
active subscription with a failed one. Account deletion cancels only the
subscription our own row happens to remember.

## Environment limits, stated up front

No Stripe keys, sandbox or otherwise, and no live webhook endpoint. Nothing
below was verified by driving a real test-mode payment. Every finding is
derived from the code and pinned by tests that reproduce Stripe's documented
behaviour (list ordering, retry-on-non-2xx, PostgREST's treatment of an
update that matches nothing). **Marked Environment-Blocked where it
matters** and carried into Pass 11.

---

## Findings

### H1 — High: the webhook acknowledges events it failed to apply

*File:* `src/app/api/billing/webhook/route.ts`

```ts
async function syncSubscription(customerId, subscription) {
  const { error } = await supabase.from(profiles).update(...).eq(...);
  if (error) {
    logEvent("stripe_webhook_sync_failed", ..., "error");   // <- logs
  }                                                          // <- and returns
}
// ...
return NextResponse.json({ received: true });                // <- always 200
```

Stripe retries a non-2xx response for up to three days. That retry is the
safety net under every subscription state in this product. Returning 200
after a failed write **throws it away**: Stripe marks the event delivered
and never sends it again.

The result is a customer whose card was charged and whose profile says
nothing happened. They keep seeing "Upgrade" and the upgrade nudge; the
Account page shows no subscription. There is no path back to correct state
except the nightly reconcile — which is a long time to be charged for
something that appears not to exist, and which (see H2) had a defect of its
own.

**A second, quieter half of the same bug.** PostgREST does not treat "matched
no rows" as an error — an update that changes nothing succeeds. So even
without a database failure, a `checkout.session.completed` for a customer id
no profile carries returns `error: null` and looks perfectly handled. The
code could not tell a write from a no-op.

*Severity:* **High.** Nothing is feature-gated on `subscription_status`
today, so the present-day damage is UI and support burden rather than
lockout. It is graded on the code being wrong in payment handling and one
line from being right — and on the fact that the moment anything *is* gated
(the plain purpose of selling a plan) this becomes "paid and locked out".

### H2 — High: the repair job can downgrade a paying customer

*File:* `src/lib/billing-reconcile.ts`

```ts
const subscriptions = await stripe.subscriptions.list({
  customer: row.stripe_customer_id,
  status: "all",     // <- includes incomplete, incomplete_expired, canceled
  limit: 1,          // <- and Stripe returns newest first
});
```

The newest subscription of *any* status is treated as the truth about the
customer. A reachable sequence:

1. A first-time subscriber opens Upgrade in two tabs. There is no active
   subscription yet, so nothing blocks either one.
2. They complete the first and abandon the second.
3. The abandoned session leaves a subscription in `incomplete`, which Stripe
   expires to `incomplete_expired` — **created after the one they paid for.**
4. The nightly job asks for the newest of any status, gets the dead one,
   concludes the profile has drifted, and writes `incomplete_expired` over
   `active`.

A paying customer is now recorded as not subscribed, **by the job whose
entire purpose is repairing exactly that kind of mistake.** The webhook had
recorded the truth and the backstop replaced it with a lie.

**What makes this clearly a defect rather than a judgement call:** the
checkout route already fixed this same bug and left a comment about it —

> *"The old call took the 5 most recent of any status and filtered here, so
> a customer with a handful of old canceled subscriptions could in principle
> push a live one off the page."*

— and queries `ACTIVE_STATUSES` explicitly. The lesson was learned in one
file and not carried to the other.

*Severity:* **High.** It corrupts correct state, it runs unattended nightly,
and it is silent.

### H3 — High: account deletion cancels only what our row remembers

*File:* `src/app/api/account/delete/route.ts`

```ts
.select("stripe_subscription_id")
const subscriptionId = billingProfile?.stripe_subscription_id;
if (subscriptionId) { await stripe.subscriptions.cancel(subscriptionId); }
```

`stripe_subscription_id` is a mirror maintained by the webhook. If it is
null or stale — the exact failure H1 makes possible — the `if` does not
fire, **the account is deleted, and Stripe goes on charging a card belonging
to someone who no longer has an account to cancel from.**

The two findings compound: H1 is how the mirror goes wrong, and H3 is what
that costs. Of everything in this pass, this is the one that takes real
money from a real person and gives them no way to notice or stop it.

*Severity:* **High**, and the most serious in this pass despite the smallest
diff.

### M1 — Medium: nothing gates on `subscription_status`

Confirmed by tracing every consumer: `AccountPage` (display),
`UpgradeButton` (label), `UpgradeNudge` (visibility), and the checkout
route's duplicate guard. **No feature is behind the plan.**

That is a product decision rather than a bug, and it is recorded here for
two reasons. First, it is what holds H1's severity down today. Second, it is
the thing most likely to change without anyone re-reading this file — the
day a feature is gated, H1 and H2 change character from "the UI is confusing"
to "a paying customer is locked out". Recorded so that connection is
already written down when it happens.

---

## What passed, with evidence

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Webhook signature verification | **Pass** | `constructEvent` with the raw body; missing signature 400s before any parsing; failures logged and rejected |
| 2 | Out-of-order webhook delivery | **Pass** | Both handlers re-fetch the subscription by id rather than trusting the event's embedded snapshot, so every event for a subscription converges on the same write. Round 1's H2, re-verified |
| 3 | Duplicate subscription on re-checkout | **Pass** | Checkout asks Stripe directly for `ACTIVE_STATUSES` before starting a session and 409s, rather than trusting the local mirror |
| 4 | Orphaned Stripe customers | **Pass** | `customers.create` uses `idempotencyKey: customer:${userId}`, so a double-click or a retry after a failed save reuses the same customer |
| 5 | Customer id saved before checkout opens | **Pass** | Saved and `500`ed on failure *before* `checkout.sessions.create`, which is what lets the webhook find the profile by customer id |
| 6 | Deleted-in-Stripe customer | **Pass** | `isMissingStripeCustomer` clears local billing state and returns an actionable 409 in both checkout and portal |
| 7 | Portal IDOR | **Pass** | Portal session is created for the caller's *own* `stripe_customer_id`, read by `auth.user.id`. No customer id is accepted from the client anywhere |
| 8 | Raw errors in billing toasts | **Pass** | `plainError` used in `UpgradeButton`, `UpgradeNudge` and `AccountPage`. Round 1's H3, re-verified |
| 9 | Account deletion cancels the subscription | **Pass, then found insufficient** | The call exists and works — Round 1's H1 is genuinely fixed. What it depends on is the finding: see H3 |
| 10 | Tax configuration | **Pass** | `automatic_tax`, `tax_id_collection`, `billing_address_collection: required`, and `customer_update: { address: "auto" }` so a new customer with no address does not get rejected up front |

---

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **No Stripe test-mode run.** No checkout completed, no webhook delivered,
   no signature verified against a real secret. The behaviours the fixes
   depend on — retry-on-non-2xx, newest-first list ordering, `status: "all"`
   including incomplete states — are documented Stripe behaviour reproduced
   in test doubles, not observed.
2. **The reconcile cron has not been run against a real Stripe account**,
   so the two-tab sequence in H2 is derived rather than reproduced.
3. **Proration, refunds, and plan changes** are untested end to end; there
   is one Price and no upgrade/downgrade path, so there was nothing to
   audit beyond confirming that.
