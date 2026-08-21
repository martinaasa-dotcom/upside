# Pass 10 — Legal (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `eb4371c` (main, after Pass 9)

> Round 2 re-derivation. Nothing in the previous `10-legal.md` was carried
> over as fact. The method here was not to read the documents for tone but
> to **check each claim against what the code actually does.**

**Headline:** the checkout screen tells people the truth in plain words —
*"Upgrading to Pro gets you nothing new (literally, not a single feature)"* —
and the Terms never said it. A consumer contract for a paid subscription
that does not describe the service is the gap; the product's own honesty is
what made it easy to close.

The documents are otherwise carefully drafted. The backup section in
particular is better than most: it names a 30-day expiry and admits
deletion takes that long to age out, which is the kind of thing policies
usually leave out.

---

## Findings

### M1 — Medium: the Terms never said what Pro is

Terms §4 covered billing mechanics thoroughly — monthly, auto-renewing,
Stripe, cancel from My account, no refund of the current period, VAT under
OSS. What it never said is **what you get**.

Pass 6 established that nothing gates on `subscription_status`: it drives
the Account display, the Upgrade button and the nudge, and unlocks no
feature. So the contract described a paid service without describing the
service, and the service is "nothing, on purpose".

The point is not that Pro is a support subscription — that is a perfectly
good thing to sell, and **the checkout dialog says so outright**:

> "Upgrading to Pro gets you nothing new (literally, not a single feature),
> but it does come with the smell of fresh coffee in the morning... it's
> twelve euros a month to directly support Upside making this."

The point is that the disclosure lived only in the dialog. EU consumer law
wants the main characteristics of a service given before the consumer is
bound, and "this unlocks nothing" is the single most material characteristic
this one has.

### M2 — Medium: the withdrawal-right waiver rested on a premise that does not hold

Terms §4 asked EU consumers to accept that their 14-day right of withdrawal
ends when the paid period starts, "consistent with the exception EU law
makes for digital services delivered immediately with your consent."

That exception exists for digital content **delivered immediately**. When
the subscription delivers no feature at all, there is nothing whose
immediate delivery justifies extinguishing the right. The waiver was the
weakest sentence in either document, and it was also the least necessary —
it takes protection away from supporters in exchange for nothing.

### L1 — Low: the privacy policy contradicted itself in one sentence

> "We send ticker symbols to fetch prices. We don't send your holdings or
> identity to these."

Ticker symbols *are* the holdings, minus quantities. Read strictly the two
sentences disagree, and the reassuring one is the second. The accurate
version is more reassuring anyway, because what actually protects the
person is that the request carries no identity.

The same bullet said "Yahoo Finance and fallback quote providers" while
naming every other processor explicitly.

---

## What passed, with evidence

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Operator identity and jurisdiction | **Pass** | `LEGAL_OPERATOR` / `LEGAL_COUNTRY` in `product.ts`, used by both documents. An existing invariant already asserts the pages name the operator, avoid naming private individuals, and match the product name |
| 2 | Every AI provider is named | **Pass** | Cerebras, Groq, Gemini and OpenRouter all appear in the privacy policy — the processors that actually receive holdings data when Margus, Pulse or Forecast run. This is the disclosure most likely to be missing in a product like this, and it is there |
| 3 | Backups and retention | **Pass, and unusually candid** | The policy describes an encrypted copy outside the main database, a 30-day expiry, and states plainly that a deleted account can take up to 30 days to age out of it |
| 4 | Card data | **Pass** | "We never see or store your card number" — accurate: checkout is a redirect to Stripe-hosted Checkout, and Pass 2 confirmed no card field exists anywhere in the app |
| 5 | Age gate matches the documents | **Pass** | `SignInGate` enforces 13 for a classroom invite and 16 otherwise; an existing invariant asserts the UI enforces exactly the ages the documents state |
| 6 | Cancellation path is real | **Pass** | Terms points at My account → Stripe portal, and that route exists and works on the caller's own customer id |
| 7 | Refund promise is honest | **Pass** | "If we ever get something visibly wrong on a charge, email us and we will sort it out" — a promise the operator can actually keep |
| 8 | VAT | **Pass** | `automatic_tax` and `tax_id_collection` are enabled in checkout, matching the OSS claim |

## Checked and deliberately not changed

**The market-data bullet now names Twelve Data and Finnhub**, but the
policy still does not name the storage provider behind the encrypted
backup copy, while it names every other processor. That is worth Martin's
attention rather than my edit: the backup destination is environment-gated
(`DR_S3_*`), so **whether a third party holds those copies at all depends
on production configuration I cannot see.** Naming a provider that might
not be in use would be its own inaccuracy.

---

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **Whether the disaster-recovery backup is configured in production**, and
   therefore whether a storage sub-processor needs naming.
2. **No legal review.** Everything here is a consistency check between the
   documents and the code. Whether the resulting terms are *sufficient* under
   Estonian and EU consumer law is a question for a lawyer, not an audit
   pass, and this pass does not claim otherwise.
3. **The published documents were not fetched from production** — the audit
   reads the source that renders them.
