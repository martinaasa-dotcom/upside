# Pass 7 — Onboarding fix log (Round 2)

Companion to `docs/audit/07-onboarding.md`. One row per finding.
**No row is Resolved without fresh re-verification by the method that
surfaced it** — here, by re-running the same probe and by reverting each fix
to watch the tests fail.

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| H1 | European number formats silently corrupt prices | High | **Resolved** | Probe re-run; 8 tests fail when reverted |
| H2 | A second purchase lot silently replaces the first | High | **Resolved** | 4 tests fail when reverted |
| M1 | A repeated Cash column is added up once per holding | Medium | **Resolved** | 3000 → 1000 |
| M2 | The paste box has no cash ceiling | Medium | **Resolved** | Matches the CSV path |

---

## H1 — read both conventions, and use the file's own punctuation to choose

Two changes, and the second is the one that makes the first reliable.

**The number reader** now finds the decimal separator instead of assuming
one. When both `.` and `,` appear, whichever comes **last** is the decimal
point — that is unambiguous and settles `1.234,56` and `1,234.56` without
any guessing. Repeated separators (`1.234.567`) can only be grouping. Every
flavour of space is stripped, including the non-breaking and narrow no-break
spaces European exports actually emit, and accounting-style `(1 234,56)`
now reads as negative.

**The delimiter is the tiebreaker for what remains.** `1,234` is 1234 to an
American and 1.234 to a European, and no amount of staring at the string
settles it. But the file's delimiter does: **Excel writes `;` precisely
because the machine's decimal separator is already `,`** — it cannot use one
character for both jobs. So a `;`-delimited or tab-delimited file is read
with comma-as-decimal, and a comma-delimited one is not. This is inference
from how the file was written, not a guess about who wrote it.

That also fixed a bug nobody had named. `parseCsvLine` treated `,` `;` and
tab as interchangeable separators *simultaneously*, so `AAPL;10;150,25`
split into four cells and the price column read `150` — the 25 cents landed
in a cell nothing looked at. One file uses one delimiter; it now detects it
and uses only that.

## H2 — add the lot, do not replace it

Duplicate tickers merge: shares are summed and the buy price becomes the
**share-weighted average**, which is both what the person meant and exactly
what the app labels that field. 300 @ 100 plus 100 @ 200 is 400 @ 125, not
400 @ 150 — pinned by a test, because the row-count average is the easy
mistake to make here.

A later lot with a blank Call % no longer erases a target an earlier lot
set. Applied to the paste box too, which had the same bug.

## M1 — take the Cash column once

First value wins. A later row that disagrees is **reported in the skipped
list** rather than quietly folded in — at that point the file means
something this importer does not understand, and guessing is exactly how the
original bug happened. Genuine `CASH` rows still add up, since those really
are separate amounts.

## M2 — the same ceiling on both routes

`isSafeSignedMoney`, matching the CSV path.

## Verified by re-running the probe

Same inputs, same instrument, before and after:

| input | before | after |
|---|---|---|
| `1,234.56` (US) | 1234.56 | 1234.56 (unchanged) |
| `1.234,56` (EU) | **1.23456** | 1234.56 |
| `1 234,56` (EU) | **123456** | 1234.56 |
| `AAPL;10;150,25` | **150** | 150.25 |
| two AAPL lots | **100 @ 150** | 200 @ 100 |
| Cash column ×3 | **3000** | 1000 |
| pasted huge cash | **accepted** | rejected |

## Verified by breaking the fixes

Reverted in place, suite re-run:

```
old parseNumber restored:      8 failed | 14 passed
lot merging removed:           4 failed | 18 passed
```

Both back to 22 passing once restored. The eight are worth naming, because
they are the ones a future refactor would silently undo: European decimals,
space thousands, non-breaking space, repeated grouping separators,
accounting negatives, the semicolon price split, the delimiter tiebreaker,
and tab-separated files.

## Tests, where there were none

`src/lib/csv-import.test.ts` — 22 tests across five groups: number
punctuation, dialect detection, purchase lots, cash, and one that runs the
**downloadable template through its own importer**, since a template the
parser chokes on is the worst first impression available and was previously
only assumed to work.

## Verification

`npm run typecheck` clean · `npm run lint` clean ·
`npm test` **191 tests / 36 files** (169 before) ·
`npm run test:invariants` green.

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **No real signup and no file uploaded through the browser.** The parser
   is exercised directly; the modal around it is read.
2. **No real broker exports** — the lot-merging fix is validated against
   CSVs shaped like broker output, not an actual export from a named broker.
3. **`1,234` in a comma-delimited file remains genuinely ambiguous.** The
   delimiter tiebreaker cannot help there, so it reads as 1234. No parser
   can do better without asking, and this one does not ask.
