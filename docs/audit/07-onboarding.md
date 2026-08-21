# Pass 7 — Onboarding & first run (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `ee46214` (main, after Pass 6)

> Round 2 re-derivation. Nothing in the previous `07-onboarding.md` was
> carried over as fact. The parser findings below were produced by feeding
> the importer real inputs and reading what came out, not by reading the
> code and reasoning about it.

**Headline:** `csv-import.ts` — 285 lines, **no tests**, and the file
`AGENTS.md` names as the way to onboard "people who aren't Martin's family"
— corrupted European number formats silently. A buy price of `1.234,56`
imported as **1.23**. Every defect in this pass has the same shape: not a
rejection the person can see and fix, but a plausible-looking number that
is not theirs, which then feeds the Sunday letter, Pulse, and the
position-size arithmetic.

## How these were found

The importer was run against inputs a real person would produce, and the
output compared with what they meant:

| input | should be | actually was |
|---|---|---|
| `1,234.56` (US) | 1234.56 | 1234.56 ✓ |
| `1.234,56` (EU) | 1234.56 | **1.23456** |
| `1 234,56` (EU) | 1234.56 | **123456** |
| `AAPL;10;150,25` | 150.25 | **150** |
| two AAPL lots, 100@50 + 100@150 | 200 shares | **100 shares @ 150** |
| Cash column repeated on 3 rows | 1000 | **3000** |
| pasted `CASH 999999999999999` | rejected | **accepted** |

Not one of these produced a skipped row or a warning.

---

## Findings

### H1 — High: European number formats silently corrupt prices

*File:* `src/lib/csv-import.ts`

```ts
const cleaned = raw.replace(/[$,€£\s]/g, "").replace(/,/g, "");
const n = Number(cleaned);
```

Stripping every comma is right for `1,234.56` and catastrophic for
`1.234,56`: the comma goes, leaving `1.23456`, which is a **perfectly valid
number**, so nothing rejects it. `1 234,56` loses its space and its comma
and becomes `123456`.

Three digits of magnitude in either direction, accepted in silence.

**Why this is the common case, not an exotic one.** This product is
Estonian, sold at a `.ee` company, and `AGENTS.md` states that CSV import
exists specifically so people outside the family can onboard. Estonian and
most European locales write `1 234,56`. The format the importer mangles is
the format its intended users will paste.

**The downstream cost is what makes it High rather than Medium.** A buy
price of 1.23 against a real price of 1,234 shows as a roughly +100,000%
gain. That number does not stay on the holdings table: the Sunday letter's
trim suggestions are driven by position-size arithmetic over these values,
and Pulse reads them too. One mistyped-looking import quietly poisons the
advice surfaces.

### H2 — High: a second purchase lot silently replaces the first

```ts
byTicker.set(ticker, { ticker, shares, buyPrice, callPct });
```

Broker exports list **lots, not positions** — buy AAPL twice and the file
has two AAPL rows. `Map.set` keeps the last. Someone importing 100 shares
at $50 and 100 at $150 ends up owning **100 at $150**: half the position
gone, the cost basis wrong, and nothing in the skipped list to notice.

This is the single most likely real-world CSV to hit this importer, because
it is what a broker hands you.

### M1 — Medium: a repeated Cash column is added up once per holding

```ts
if (cashCol >= 0) {
  const cashHere = parseNumber(cells[cashCol]);
  if (...) result.cash = (result.cash ?? 0) + cashHere;   // every row
}
```

A Cash column carries the account's cash balance, and an export repeats it
on every row. A three-position book turns €1,000 into €3,000.

### M2 — Medium: the paste box has no cash ceiling

The CSV path guards cash with `isSafeSignedMoney`; `parseHoldingsPaste`
does not, so pasting `CASH 999999999999999` sets a balance the rest of the
app treats as impossible. An inconsistency between two routes doing the
same job — the same shape as Pass 2's `portfolios/join` finding.

---

## What passed, with evidence

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Community auto-join on sign-in | **Pass** | No `insert`/`upsert` into `portfell_community_members` anywhere outside the invite and join-request paths. `ensure-profile.ts`'s only community call is `portfell_sync_household_community_memberships`, the household mirroring `AGENTS.md` explicitly permits. The rule migration `030` established still holds |
| 2 | Onboarding never fails silently | **Pass** | `ExperienceOnboardingModal` sets a plain-English message on every exit — bad ticker, implausible symbol, bad share count, bad price, FX unavailable, portfolio creation failed, holding save failed — plus `stockBusy` guarding re-entry. Re-verified from Pass 5, where it was the standard the watchlist was measured against |
| 3 | Zero-cost-basis placeholder | **Pass** | `parseHoldingsPaste` skips a line with no price rather than inserting `0.01`. The comment explains why: a 0.01 basis reads as +1,000,000% and feeds the same advice surfaces H1 poisons. Deliberate and correct |
| 4 | The downloadable template parses | **Pass** | `HOLDINGS_CSV_TEMPLATE` round-trips through `parseHoldingsCsv` with zero skipped rows, both holdings, and cash 2500. Now pinned by a test, since a template its own parser chokes on is the worst possible first impression |
| 5 | Ticker resolution | **Pass** | Unrecognised tickers are skipped with a reason and a line number, not guessed at |
| 6 | Onboarding skip logic | **Pass** | `shouldSkipExperienceOnboarding` skips for existing holdings or a household seed slug. Correct — and it is the reason Pass 5's options-gate decision went the way it did |

---

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **No real signup.** The whole path is traced through code and exercised
   at the library level; no account was created against a real Supabase
   project and no file was uploaded through the browser.
2. **No real broker exports.** The lot-merging fix is validated against
   hand-written CSVs shaped like broker output, not against an actual
   export from a named broker.
3. **The genuinely ambiguous `1,234`** cannot be resolved from the string
   alone. The file's delimiter is used as the tiebreaker (see the fix log);
   a comma-delimited file written by a European whose tooling still emitted
   `,` as the decimal mark would read 1,234 as 1234. No parser can do
   better without asking, and the importer does not ask.
