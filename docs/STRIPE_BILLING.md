# Stripe Billing + Tax

Built against the actual stack: Next.js App Router, Supabase (service role
in API routes via `getSupabaseDataClient`), Vercel. Follows the existing
conventions -- `requireAuthUser`, `observeRoute`, `PORTFELL_TABLES`, cached
singleton clients like `getSupabaseServer`.

## Files

```
supabase/migrations/20260818210000_stripe_billing.sql   new columns on portfell_profiles
src/lib/stripe.ts                                        Stripe client singleton
src/app/api/billing/checkout/route.ts                     starts a Checkout session
src/app/api/billing/portal/route.ts                        opens the Billing Portal
src/app/api/billing/webhook/route.ts                       mirrors subscription state
src/app/api/billing/status/route.ts                        subscription status for the signed-in user
src/components/billing/UpgradeButton.tsx                   Upgrade / Manage billing button
```

## Setup steps

1. **Install the SDK** -- already added to `package.json` (`stripe`).

2. **Run the migration** -- adds `stripe_customer_id`, `stripe_subscription_id`,
   `subscription_status`, `plan`, `current_period_end` to `portfell_profiles`.

3. `database.types.ts` has already been hand-patched with these 5 fields.
   Regenerate it from Supabase (`supabase gen types typescript ...`) after
   the migration lands in production to pick up anything else that drifted.

4. **Create the Product + Price in Stripe** (Dashboard -> Product catalog).
   Copy the Price ID (`price_...`) for the next step.

5. **Set env vars** (add to `.env.local` and Vercel; see `.env.example`):
   ```
   STRIPE_SECRET_KEY=sk_live_...       # sk_test_... while developing
   STRIPE_PRICE_ID=price_...
   STRIPE_WEBHOOK_SECRET=whsec_...     # from step 6
   ```

6. **Register the webhook.**
   - Local dev: `stripe listen --forward-to localhost:3000/api/billing/webhook`
     -- it prints a `whsec_...` to put in `.env.local`.
   - Production: Stripe Dashboard -> Developers -> Webhooks -> Add endpoint
     -> `https://upsidelab.app/api/billing/webhook`, events:
     `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`. Copy that endpoint's signing secret
     into Vercel's `STRIPE_WEBHOOK_SECRET`.

7. **Turn on Stripe Tax** in the Stripe Dashboard (Settings -> Tax), and add
   the Estonian OSS registration there -- this is what makes
   `automatic_tax: { enabled: true }` in the checkout route actually apply
   the right VAT per EU country, and 0% reverse charge when a buyer enters
   a valid business VAT ID (the `tax_id_collection` field already does that
   on the Checkout page).

## Wiring

`UpgradeButton` is already wired into `/account` (Billing section in
`src/components/AccountPage.tsx`). It fetches `subscription_status` from
`GET /api/billing/status` on mount, same pattern as the experience-tier
fetch already on that page, then posts to `/api/billing/checkout` or
`/api/billing/portal` depending on whether a subscription is active.

## Gating a premium feature

Nothing automatic -- check `subscription_status` wherever a feature should
be paywalled, same as any other profile field:

```ts
const { data: profile } = await supabase
  .from(PORTFELL_TABLES.profiles)
  .select("subscription_status")
  .eq("id", auth.user.id)
  .maybeSingle();

const isSubscribed =
  profile?.subscription_status === "active" ||
  profile?.subscription_status === "trialing";
```

## Why hosted Checkout, not a custom form

No PCI scope, no card element to build/maintain, and it comes with
Stripe Tax and `tax_id_collection` built in for free -- which matters given
this runs through OSS. Worth revisiting only if the redirect ever becomes a
real conversion problem; for a solo-maintained app it's the lower-risk
default.

## Testing before going live

Use Stripe test mode (`sk_test_...` key, test card `4242 4242 4242 4242`)
end to end: checkout -> webhook fires -> `subscription_status` becomes
`active` on the profile -> portal session opens -> cancel -> status becomes
`canceled`. Then flip to live keys.
