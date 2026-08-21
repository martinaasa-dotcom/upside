# Pass 9 — Compliance fix log (Round 2)

Companion to `docs/audit/09-compliance.md`.

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| M1 | Two projection surfaces had no framing | Medium | **Resolved** | Both now carry a disclaimer in the panel header |
| M2 | Export omitted co-ownership and account aliases | Medium | **Resolved** | New fields in both formats; test asserts both |
| L1 | Unused constant in the legal-text file | Low | **Resolved** | Replaced with one that is displayed |

---

## M1 — framing on the surfaces that project money

**Scenario simulator** now carries `FORECAST_DISCLAIMER` — the constant is
documented "for forecast/scenario-modeling surfaces specifically", and this
is one, so no new wording was invented.

**Growth calculator** gets a new `PROJECTION_DISCLAIMER`:

> "This is arithmetic on the numbers you typed, not a prediction. Real
> investments go up and down, and no rate of return is guaranteed."

Deliberately not a reuse of the advice language, and the reasoning is the
point. On the AI surfaces the risk is being read as advice. Here the risk is
being read as a **prediction** — and "not personalized investment advice"
does nothing about that. The sentence that matters is that the rate is an
assumption.

Written to the house standard: a grandma gets every word of it. No "past
performance", no "projected returns", no "hypothetical".

## L1 — folded into M1

`ADVICE_DISCLAIMER_LONG` was unused. Rather than delete it and leave a gap,
it was **replaced** by `PROJECTION_DISCLAIMER`, which is displayed. The file
comment now states the rule explicitly: everything defined there is shown
somewhere, because an unused variant in a legal-text file reads as coverage
that does not exist.

## M2 — the export now answers "who else can see this?"

Added `portfolio_co_owners` and `account_aliases`.

**Two things went wrong while fixing it, both worth recording.**

**The first draft used a PostgREST `.or()` filter with the address
interpolated into it:**

```ts
.or(`alias_email.eq.${email},primary_email.eq.${email}`)
```

An `or` filter is a string the client assembles, so interpolating a value
into it puts the filter's own grammar — commas, dots, parentheses — within
reach of that value. Nobody controls their own auth email here today, so
this was not exploitable; it is the kind of construction that is safe only
because of a fact elsewhere, and stops being safe quietly. Replaced with two
equality queries and a dedupe.

**The second was caught by the test rather than by reading.** The new fields
went into the JSON export and not into `toExportCsv`, so a person choosing
CSV would have received a quietly smaller copy of their data than a person
choosing JSON — a right-of-access answer that depends on which button was
pressed. The test asserts both formats carry both fields, which is why it
failed:

```
AssertionError: expected '# account\nuser_id,email\n…' to contain 'portfolio_co_owners'
```

The existing `gdpr.test.ts` also caught the change at the type level before
any of this, by failing to compile — the fixture is a full `UserDataExport`,
so adding a required field breaks it. That is the fixture doing its job.

## Verification

`npm run typecheck` clean · `npm run lint` clean ·
`npm test` **192 tests / 36 files** · `npm run test:invariants` green.

## Unable to Verify (Environment-Blocked)

1. **The new export queries have not run against a real database**, so they
   are confirmed to compile and to be serialized, not to return rows.
2. **No real deletion run**; completeness is argued from the RPC and the FK
   cascades.
3. **No retention policy exists to audit the code against.**
