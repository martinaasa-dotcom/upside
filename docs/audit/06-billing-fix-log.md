# Pass 6 — Billing & upgrading: fix log

One row per finding in [`06-billing.md`](06-billing.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file, `npm run test`
111/111, `npm run test:invariants` at its 2 pre-existing failures.

Standing context from the report, which every row below sits inside:
**Upside Lab Pro gates zero product features** — it's a $12/month support
tier — so none of these findings withhold or wrongly grant access to
anything. The one that mattered financially (H1) was fixed when the pass
first ran.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| H1 | Deleting your account never canceled your Stripe subscription — you'd keep being charged | High | **Resolved** (prior session) | Report §High 1 | Fixed when the pass was first run, merged to `main`. The only finding in this pass with real ongoing financial harm. |
| H2 | Webhook trusted the embedded subscription snapshot; an out-of-order retry could resurrect a canceled subscription | High | **Resolved** (prior session) | Report §High 2 | Fixed when the pass was first run. |
| H3 | Billing UI showed raw API error text in toasts | High | **Resolved** (prior session) | Report §High 3 — now routed through `plainError()` from Pass 5 | Fixed when the pass was first run. |
| M1 | No reconciliation backstop between Stripe and the local mirror | Medium | **Deferred** | — | Every other durable-state domain here has a self-healing cron, and billing doesn't — but nothing gates on `subscription_status` today, so a drifted value has no user-visible effect. Adding a `stripe.subscriptions.list()` reconciliation cron means a new route plus a `vercel.json` entry, i.e. new scheduled infrastructure for a value that is currently decorative. Worth doing **before** that value is ever load-bearing; flagged for Martin rather than added speculatively. |
| M2 | `/api/billing/checkout` could create a duplicate, orphaned Stripe customer | Medium | **Resolved** | `src/app/api/billing/checkout/route.ts:59-68` — `stripe.customers.create()` now takes `{ idempotencyKey: \`customer:${auth.user.id}\` }`. | Exactly the fix the report proposed, keyed on the stable Supabase user id. A double-click, or a retry after the subsequent Supabase write failed, now reuses the customer Stripe already created instead of orphaning one per attempt. |
| M3 | The "already subscribed?" guard only inspected a customer's 5 most recent subscriptions | Medium | **Resolved** | `src/app/api/billing/checkout/route.ts:80-95` and `src/lib/billing-status.ts:8-24`. The call now asks Stripe for exactly the blocking statuses instead of taking 5 of *any* status and filtering locally. | Went one step past the report: rather than hardcoding `["active","trialing","past_due"]` at the call site — a second copy of a list that already existed — `ACTIVE_STATUSES` is now exported from `billing-status.ts` and drives both the Stripe query and `isActiveSubscription()`. Verified the two matched exactly before making the change, so this closes the finding without narrowing what counts as active. |
| L1 | `.env.example` pointed at a `README-STRIPE.md` that doesn't exist | Low | **Resolved** | `.env.example:121` — the dead reference is gone; the comment still names where the webhook secret comes from (`stripe listen` for dev, the Dashboard endpoint for prod), which was the useful half. | Took the "drop the reference" option rather than writing a doc, since the surrounding comment already carries the setup detail the missing file would have held. |
| L2 | No dedicated per-route rate limit on `/api/billing/checkout` or `/api/billing/portal` | Low | **Deferred** | — | Not billing-specific: these sit under the same blanket IP cap as every mutating route, and Pass 2 already recorded that per-instance limiter as its own Medium (M1 there). Creating a Checkout or Portal session has no meaningful cost to abuse and Stripe's APIs have their own protections. Closing it properly means the shared durable-limiter work from Pass 2, not a billing-local patch. |

## Deferred summary

Two items left unfixed, neither silently. **M1** is new scheduled
infrastructure for a value nothing currently reads — the right time to
add it is before `subscription_status` gates anything, and that's
Martin's call. **L2** is a symptom of Pass 2's systemic rate-limiting
item rather than a billing defect, and belongs with that fix.
