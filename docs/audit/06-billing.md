# Pass 6 — Billing Audit

Scope: the Stripe subscription surface end to end — webhook signature
verification, idempotency, and event ordering; entitlement/plan-gating
logic and whether it can be bypassed; billing-column write paths against
the Pass 2 `lock_billing_columns` trigger; price/plan/proration flows;
cancellation and account-deletion consequences; error handling (raw
Stripe/Postgres error leaks); and key/secret hygiene. Read against
`AGENTS.md` and `docs/audit/02-security.md` (which already covers the RLS
trigger that locks the five billing-mirror columns) first, so those
weren't re-litigated here.

Branch: `claude/audit-billing`, based on `origin/main` @ `2482813`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 0 | — |
| High | 3 | 3 |
| Medium | 3 | 0 (backlog) |
| Low | 2 | 0 (backlog) |

The single most important context for this pass: **Upside Lab Pro gates
nothing.** `UpgradeNudge.tsx`'s own dialog copy says it outright ("gets
you nothing new, literally, not a single feature") — it's a $12/month
support tier, not a paywall. `grep`ing the whole `src/` tree for
`subscription_status` / `isActiveSubscription` / `stripe_customer_id`
turns up exactly the billing routes and the two UI components that show
an "Upgrade" vs. "Manage billing" button — nothing else reads or branches
on subscription state. So most of the classic SaaS-billing risk surface
(client can unlock paid features, canceled sub keeps access, race lets
someone dodge a paywall) **does not apply yet** — there is nothing to
unlock. The findings below are about billing *correctness and data
integrity* instead: does the money side do what it says, and does a
person who cancels or deletes their account actually get what canceling
should mean.

---

## High

### 1. Deleting your account never canceled your Stripe subscription — you'd keep being charged forever

**Where:** `src/app/api/account/delete/route.ts`.

**What's wrong:** self-service account deletion (`portfell_delete_my_account`,
`supabase/migrations/20260817124031_gdpr_hard_delete_cash_events.sql:287-331`)
deletes the `portfell_profiles` row outright — including
`stripe_customer_id` and `stripe_subscription_id` — with no call to Stripe
anywhere in the flow. A subscribed person who deletes their account keeps
their card charged every month indefinitely: the row that pointed at the
subscription is gone, so `/api/billing/status` reports `null` and the
Account page (now inaccessible anyway, since the account is deleted) can
no longer show "Manage billing." Their only way to actually stop being
billed is finding an old Stripe receipt email and using its "Manage your
subscription" link, or emailing support — nothing in-app tells them this,
and the deletion confirmation UI (`ConfirmModal` on the Danger Zone) says
nothing about billing at all. This is exactly the "refund/cancellation UX
and data consequences" risk the audit brief asks about, and it's the one
finding in this pass with real, ongoing financial harm to a real person.

**Fix:** `src/app/api/account/delete/route.ts` now reads the caller's own
`stripe_subscription_id` (RLS already permits a user to `select` their own
profile row) before the delete RPC runs, and — if `STRIPE_SECRET_KEY` is
configured and a subscription id is on file — calls
`stripe.subscriptions.cancel(subscriptionId)`. This is deliberately
best-effort: a Stripe failure (already-canceled subscription, transient
network error, bad key) is logged via `logEvent("account_delete_stripe_cancel_failed", …, "error")`
but never blocks the data deletion the person actually asked for — GDPR
erasure has to complete either way. Cancellation is immediate (Stripe's
default), not `cancel_at_period_end`, matching "delete my account" intent;
no proration/refund is issued for the partial period, which matches how
the Stripe-hosted Billing Portal's own cancel flow already behaves for
this app (no separate refund policy exists to contradict).

### 2. Webhook trusted the embedded subscription snapshot instead of re-fetching — an out-of-order retry could resurrect a canceled subscription

**Where:** `src/app/api/billing/webhook/route.ts` (`customer.subscription.updated`
/ `customer.subscription.deleted` handlers).

**What's wrong:** Stripe explicitly does not guarantee webhook delivery
order — a delayed retry of an older event can arrive after a newer one.
The `checkout.session.completed` handler already re-fetches the
subscription fresh (`stripe.subscriptions.retrieve(subscriptionId)`)
before writing, but the `customer.subscription.updated` /
`customer.subscription.deleted` handlers instead wrote whatever snapshot
was embedded in *that specific event* straight to the database. Concretely:
someone upgrades, Stripe fires `customer.subscription.updated` (status
`active`); they cancel seconds later, Stripe fires
`customer.subscription.deleted` (status `canceled`). If the first event's
delivery is delayed by Stripe's retry logic and lands *after* the second,
the final row in `portfell_profiles` reads `active` even though the
subscription is actually canceled — a real "race condition between
webhook events" of exactly the kind this pass was asked to look for. It
doesn't gate anything today (see Summary), so the concrete blast radius
right now is a wrong "Manage billing" vs. "Upgrade" label and a missed
"Payment failed" badge — but it's exactly the kind of silent, hard-to-spot
bug that would carry forward the moment billing status gates anything, the
same reasoning Pass 2 used for the RLS trigger fix.

**Fix:** both handlers now call `stripe.subscriptions.retrieve(eventSubscription.id)`
before writing, same pattern as `checkout.session.completed`. Stripe's API
always returns the subscription's *current* true state, so every event for
a given subscription — regardless of delivery order — converges on writing
the same, correct row. `docs/audit/02-security.md`'s "Stripe webhook"
verified-clean note (signature-before-DB, raw body via `req.text()`) still
holds; this fix only changes what gets written, not the trust boundary.

### 3. Billing UI showed raw API error text in toasts instead of routing through `plainError()`

**Where:** `src/components/billing/UpgradeButton.tsx`,
`src/components/billing/UpgradeNudge.tsx`.

**What's wrong:** this is precisely the class of bug Pass 5 fixed for
~30 other routes via `plainError()`'s `looksTechnical()` heuristic
(`docs/audit/05-ux.md`, High #2) — but the two billing components predate
that fix and were never brought in line with it. Both called
`toast.error(data.error ?? "Couldn't open billing right now.")` directly on
whatever `/api/billing/checkout` or `/api/billing/portal` returned. Both
of those routes have real raw-driver-error passthroughs: `return
NextResponse.json({ error: profileError.message }, { status: 500 })` and
`{ error: saveError.message }` in `checkout/route.ts:52,70` return a raw
Postgres/PostgREST error verbatim on any DB hiccup while looking up or
saving `stripe_customer_id` — a `duplicate key value violates unique
constraint "portfell_profiles_stripe_customer_id_idx"` (the unique index
added in `20260818210000_stripe_billing.sql:17-19`) or similar would have
rendered straight into a toast on the one page in the app that handles
money.

**Fix:** both components now import `plainError` from
`src/lib/plain-error.ts` and wrap the same way every other component in
the codebase already does: `toast.error(plainError(data.error, "Couldn't
open billing right now."))`. The human-written error strings the billing
routes already return (`"Your last payment failed…"`, `"You already have
an active subscription…"`, `"That billing account is gone…"`, genuine
Stripe customer-facing error messages via `stripeErrorMessage()`) pass
through `plainError()` unchanged, since none of them trip
`looksTechnical()`'s markers, contain a bare `"`, or exceed 160 characters
— so no visible copy changes for the normal-path messages, only the
previously-unfiltered raw-driver-error path is now caught.

---

## Medium (backlog — not fixed this pass)

1. **No reconciliation backstop between Stripe and the local mirror.**
   Every other durable-state domain in this app has a self-healing job —
   nightly `portfell_book_snapshots` (`/api/cron/snapshot`), the
   `disaster-recovery` cron for cold copies — but billing has none. If the
   webhook endpoint is ever silently broken (rotated `STRIPE_WEBHOOK_SECRET`
   not updated in Vercel, Stripe disables the endpoint after repeated
   failures, etc.), `portfell_profiles.subscription_status` drifts from
   Stripe's truth indefinitely with nothing to notice or self-correct. No
   impact today (nothing gates on the value), but worth a periodic
   `stripe.subscriptions.list()` reconciliation cron (similar shape to the
   existing `/api/cron/*` routes) before this value is ever load-bearing.
2. **`/api/billing/checkout` can create a duplicate, orphaned Stripe
   customer.** `src/app/api/billing/checkout/route.ts:58-71`: two
   concurrent requests (double-click, or a request that creates the Stripe
   customer but fails on the subsequent Supabase write due to a transient
   error) can each see `stripe_customer_id` as null and each call
   `stripe.customers.create()` — no idempotency key ties the create to a
   stable value like the Supabase user id. Harmless in practice (the
   orphaned customer has no subscription, and the "already has an active
   subscription" defensive check a few lines down would still find and
   reuse whichever customer id actually got saved), but worth a
   `stripe.customers.create({ ... }, { idempotencyKey: auth.user.id })` fix
   to close it outright.
3. **The "already subscribed?" guard only inspects a customer's 5 most
   recent Stripe subscriptions.** `src/app/api/billing/checkout/route.ts:77-81`
   (`stripe.subscriptions.list({ customer: customerId, status: "all", limit: 5 })`).
   Not exploitable today (Upside Lab sells exactly one price, so a real
   customer accumulates at most a handful of subscriptions over a long
   history, and Stripe's default list order is most-recent-first so an
   active one is essentially always within the first 5), but it's an
   unbounded assumption sitting on a hardcoded page size — worth paginating
   or filtering `status: "active"`/`"trialing"`/`"past_due"` directly in
   the API call instead of over fetching everything and filtering client-side.

## Low (backlog)

1. **`.env.example:120` points at a `README-STRIPE.md` that doesn't exist
   in the repo.** Whoever next sets up Stripe env vars / registers the
   webhook endpoint following that comment hits a dead link. Either write
   the doc or drop the reference.
2. **No dedicated per-route rate limit on `/api/billing/checkout` or
   `/api/billing/portal`** beyond the blanket IP-based `limitMutationRequest()`
   already applied to every mutating `/api/*` route in `src/proxy.ts`
   (documented as an accepted, systemic trade-off in Pass 2's Medium #1).
   Not billing-specific and not urgent — Stripe's own APIs have their own
   abuse protections, and creating a Checkout/Portal session has no
   meaningful cost to abuse — noting only for completeness since this pass
   was asked to look at the billing surface specifically.

---

## Needs a decision

None. Nothing here required guessing at intended behavior — the one
genuinely ambiguous question ("should account deletion refund the current
billing period, or just stop future charges?") resolved on inspection:
Stripe's own Billing Portal cancel flow (which this app already links to
via "Manage billing") does not refund partial periods either, so
`stripe.subscriptions.cancel()`'s default (stop billing, no refund)
matches the behavior already exposed elsewhere in the app rather than
introducing a new, undocumented refund policy.

---

## Verified clean (checked, no finding)

- **Nothing is paywalled.** Confirmed by grep and by reading
  `UpgradeNudge.tsx`'s own copy — Pro is a support tier, not a feature
  gate. This eliminates the entire "can a user manipulate client state to
  unlock paid features" / "does a canceled subscription lose access
  promptly" risk category for today's app; re-check this the moment
  anything is actually gated on `subscription_status`.
- **Webhook signature verification.** `src/app/api/billing/webhook/route.ts`
  reads the raw body via `req.text()` and calls
  `stripe.webhooks.constructEvent()` before touching the database or
  trusting anything in the payload — re-confirmed, matches Pass 2.
- **Idempotency of the webhook's actual DB write.** `syncSubscription()`
  always writes Stripe's current full snapshot for the five mirrored
  columns (never an increment/append), so a Stripe retry that re-delivers
  the same event, or two different events that both resolve to the same
  final subscription state, converge on an identical, harmless
  no-op-equivalent write. The only real risk was delivery *order*, not
  duplication — fixed in High #2.
- **Billing writes against the Pass 2 `lock_billing_columns` trigger.**
  Every write to the five locked columns (`checkout/route.ts`,
  `portal/route.ts`, `webhook/route.ts`) goes through `getSupabaseServer()`
  directly or `getSupabaseDataClient()`, which resolves to the service-role
  client whenever `SUPABASE_SERVICE_ROLE_KEY` is set — true in every
  deployed environment per `AGENTS.md`. `auth.uid()` is null on that
  connection, so the trigger's `if auth.uid() is null then return new`
  early-out lets every real write path through unchanged. The
  local-dev-without-service-role-key fallback caveat is the same one Pass 2
  already flagged and accepted; not re-litigated here.
- **Price/plan/proration flows.** Upside Lab sells exactly one Stripe
  Price (`STRIPE_PRICE_ID`), no trial period, no quantity, no multi-plan
  upgrade/downgrade UI — there is no proration surface to audit. Checkout
  always redirects to Stripe-hosted Checkout; any plan change would happen
  in the Stripe-hosted Billing Portal, entirely outside this app's code.
- **Key/secret hygiene.** `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` /
  `STRIPE_PRICE_ID` are read only in `src/lib/stripe.ts` (server-only,
  never imported from a `"use client"` file) and never appear in any
  response body, log line, or the client bundle. `isMissingStripeCustomer()`
  already handles the test/live key mismatch case gracefully (a stale
  customer/price id from the other mode 404s as `resource_missing`; the
  app clears the local billing mirror and asks the person to retry rather
  than surfacing Stripe's raw 404).
- **Subscription lifecycle statuses.** `isActiveSubscription()` (`active`,
  `trialing`, `past_due`) and `subscriptionNeedsAttention()` (`past_due`
  only) in `src/lib/billing-status.ts` are the only two status groupings
  the app needs today and both are correct for what little UI branches on
  them (Upgrade-vs-Manage button, "Payment failed" badge). `incomplete` /
  `incomplete_expired` / `unpaid` correctly fall through to "not
  subscribed, show Upgrade" — right behavior, since none of those mean a
  successful payment ever happened.

---

## Fixes applied this pass

- `src/app/api/account/delete/route.ts` — cancel the Stripe subscription
  on account deletion (High #1).
- `src/app/api/billing/webhook/route.ts` — re-fetch the subscription by id
  in the `customer.subscription.updated`/`.deleted` handlers instead of
  trusting the embedded event payload (High #2).
- `src/components/billing/UpgradeButton.tsx`,
  `src/components/billing/UpgradeNudge.tsx` — route billing errors through
  `plainError()` before showing them in a toast (High #3).

No `scripts/test-invariants.ts` assertions reference the billing surface
(`grep`ed for `UpgradeButton`, `UpgradeNudge`, `billing/`, `Stripe`/`stripe`
— no hits besides the pre-existing `account/delete` path check for
`revokeAllUserSessions` / `signOut(jwt, "global")` / `deleteUser`, all of
which are untouched by this pass's diff), so no invariant updates were
needed.

## Checks run

- `npm run typecheck` → clean.
- `npx eslint --max-warnings 0 --ignore-pattern '.claude/**'` → clean.
- `npx tsx scripts/test-invariants.ts` → 2 failures, both pre-existing and
  named in the task brief as unrelated to this pass (`circle awards are a
  grid of cards, not a flat divided list`, `Fund page labels Margus's note
  Thesis`). No new failures.
