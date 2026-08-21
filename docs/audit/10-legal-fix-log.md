# Pass 10 — Legal fix log (Round 2)

Companion to `docs/audit/10-legal.md`.

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| M1 | Terms never said what Pro is | Medium | **Resolved** | §4 now states it in bold; invariant keeps it true |
| M2 | Withdrawal-right waiver rested on a false premise | Medium | **Resolved** | Waiver removed |
| L1 | Privacy policy contradicted itself on ticker symbols | Low | **Resolved** | Rewritten; fallback providers now named |

---

## M1 — the contract now says what the checkout screen says

Terms §4 gained one bold sentence and its explanation:

> **Pro does not unlock any features.** Every part of Upside Lab works the
> same whether you subscribe or not; Pro is a way to support the work,
> nothing more. The checkout screen says the same thing, and this section
> exists so the contract says it too.

No wording was invented — the substance is lifted from the dialog that was
already telling people the truth. The gap was that the disclosure lived in
one place and the contract in another.

## M2 — the waiver is gone

The old sentence asked EU consumers to accept that their 14-day withdrawal
right ended when the paid period started, on the basis of the exception for
digital content delivered immediately.

Removed, and the reason is stated in the document itself rather than
quietly:

> ...you have a 14-day right of withdrawal under EU law, and we do not ask
> you to waive it. The waiver EU law allows is for digital content delivered
> to you immediately; since Pro delivers no feature, that exception is not
> one we are willing to lean on.

This is a change in the consumer's favour, which is the only direction an
audit should move contract terms on its own initiative. If Pro ever does
deliver something, reinstating a waiver is a decision for Martin with a real
premise behind it.

## L1 — the market-data bullet

Was:

> "We send ticker symbols to fetch prices. We don't send your holdings or
> identity to these."

Ticker symbols *are* the holdings minus quantities, so the two sentences
disagreed and the reassuring one was the false one. Now:

> "(Yahoo Finance, with Twelve Data and Finnhub as fallbacks). We send
> ticker symbols to fetch prices — so a provider sees which companies
> someone looked up, but never how many shares you own, what you paid, or
> who you are. The request carries no account, no name, and no session."

More accurate *and* more reassuring, because it names the thing that
actually protects the person: the request carries no identity. The two
fallback providers are named, matching how every other processor is
handled.

## The guard: `the Terms' description of Pro stays true`

"Pro unlocks nothing" is accurate today and is exactly the kind of claim
that goes quietly false. Somebody puts a feature behind the plan, and the
contract is wrong and the checkout copy is wrong with it — and nobody
editing a component would think to reopen the Terms.

The invariant asserts the two sentences are present, then scans all of
`src/` for `isActiveSubscription` / `subscriptionNeedsAttention` outside a
listed set of files where knowing whether someone pays is legitimately the
job (billing UI, the billing routes, the reconcile job).

The failure message says what to do about it, because deleting the test is
the tempting wrong answer:

```
$ # add a subscription check to a feature component
fail  the Terms' description of Pro stays true
  a subscription check outside billing means Pro now gates something, so
  the Terms and the checkout copy are no longer true:
  src/components/OverviewDashboard.tsx
```

Green again once reverted.

## Verification

`npm run typecheck` clean · `npm run lint` clean ·
`npm test` **192 tests** · `npm run test:invariants` green.

## Unable to Verify (Environment-Blocked)

1. **No legal review.** This pass checks the documents against the code. It
   does not and cannot judge sufficiency under Estonian or EU consumer law.
2. **Whether the DR backup is configured in production**, which decides
   whether a storage sub-processor needs naming in the privacy policy.
3. **The live published pages were not fetched** — the source that renders
   them was read instead.
