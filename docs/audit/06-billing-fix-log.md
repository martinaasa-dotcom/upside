# Pass 6 — Billing fix log (Round 2)

Companion to `docs/audit/06-billing.md`. One row per finding.
**No row is Resolved without fresh re-verification by the method that
surfaced it** — here, by breaking each fix on purpose and watching the test
fail.

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| H1 | Webhook acknowledges events it failed to apply | High | **Resolved** | 6 tests; mutation-tested |
| H2 | Repair job can downgrade a paying customer | High | **Resolved** | 6 tests; mutation-tested |
| H3 | Deletion cancels only what our own row remembers | High | **Resolved** | Cancels by customer, Stripe as the authority |
| M1 | Nothing gates on `subscription_status` | Medium | **No change needed** | Product decision; recorded with the connection to H1/H2 |

---

## H1 — let Stripe retry

The webhook now returns **500** when a write does not land, so Stripe
redelivers. Replay is safe by construction: every handler re-fetches the
subscription by id and writes whatever Stripe says *now*, so a retry
converges on the same state rather than compounding.

The second half was quieter and mattered as much. PostgREST does not treat
"matched no rows" as an error, so this:

```ts
const { error } = await supabase.from(profiles).update(...).eq("stripe_customer_id", id);
```

could not tell a write from a no-op. It now asks for `{ count: "exact" }`
and treats `count === 0` as a failure to be retried — checkout saves the
customer id *before* it opens a session, so a row missing at this instant is
usually a row that is about to exist, which is precisely the case a retry
fixes and a 200 does not.

## H2 — ask for live subscriptions first

Reconcile now queries `ACTIVE_STATUSES` explicitly and only falls back to
"newest of any status" when there is genuinely no live subscription — at
which point that newest one *is* the right answer, because it describes how
the customer's billing actually ended.

This makes reconcile agree with the checkout route, which already queried
this way. The two can no longer disagree about what counts as a live
subscription.

## H3 — cancel what Stripe has, not what we remember

Deletion now lists the customer's live subscriptions from Stripe and cancels
each, keeping the stored `stripe_subscription_id` as a fallback for a profile
that has one but no customer id.

The reasoning is worth stating because it is the theme of this whole pass:
reading our own mirror meant that **the one case where our data is stale was
also the case where someone gets deleted and billed forever.** Those are the
worst two things to have coincide. Stripe is the only thing that knows what
would produce a charge, so that is what gets asked.

## Verified by breaking them on purpose

A test that cannot fail is worth less than no test, so each fix was reverted
in place and the suite re-run:

**H1** — restored the unconditional 200:

```
× asks Stripe to retry when the database write fails
× asks Stripe to retry when the update matched no profile
  Tests  2 failed | 4 passed (6)
```

**H2** — restored `status: "all", limit: 1`:

```
× does not downgrade a paying customer because of a newer failed attempt
× prefers the live subscription over a newer trailing one
  Tests  2 failed | 4 passed (6)
```

Both back to green once restored.

## Tests, where there were none

This code handled money and had **no test file at all**. There are now 12,
across two files, written against Stripe's documented behaviour rather than
around the implementation:

`src/lib/billing-reconcile.test.ts` — the fake Stripe returns **newest
first** and treats `status: "all"` as including every state, exactly as the
real list endpoint does, so the two-tab sequence from the report is
reproduced rather than described. Covers: no downgrade from a newer failed
attempt; a genuine cancellation still recorded; a missed upgrade repaired;
`past_due` counted as live; local state cleared when Stripe has nothing; a
never-subscribed customer left alone.

`src/app/api/billing/webhook/webhook.test.ts` — covers: a 200 only when the
write landed; **500 on a failed write**; **500 when the update matched no
profile**; re-fetch by id rather than trusting the event body; bad signature
rejected without touching the database; unhandled event types acknowledged
cleanly, so Stripe does not retry them forever.

## Verification

`npm run typecheck` clean · `npm run lint` clean ·
`npm test` **169 tests / 35 files** (157 before) ·
`npm run test:invariants` green.

## Verification waived (2026-08-21)

Martin closed the outstanding Stripe test-mode run as an accepted risk
rather than performing it. **Nothing below became verified as a result** —
the three fixes are still argued from documented Stripe behaviour and
mutation tests, not observed against Stripe. `11-go-no-go.md` B2 lists what
remains unverified and the six telemetry events that surface each failure
mode in production.

## Unable to Verify (Environment-Blocked)

Carried into Pass 11, unchanged in kind:

1. **No Stripe keys and no live endpoint**, so no fix here has been
   exercised against real Stripe. The behaviours they rest on —
   retry-on-non-2xx, newest-first ordering, `status: "all"` including
   incomplete states — are documented behaviour reproduced in test doubles.
2. **The H2 sequence is derived, not reproduced against a real account.**
3. **H3's cancellation path has not been run**, so "no further charges" is
   argued from the API contract rather than observed.
