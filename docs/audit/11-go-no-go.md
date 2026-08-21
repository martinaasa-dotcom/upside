# Pass 11 — Go / No-Go

**Date:** 2026-08-21 · **Base:** `f74bd22` (main, all ten passes merged)

---

## Verdict

**Go for the people already using it. No-Go for taking money from
strangers — until four migrations are applied and billing is exercised in
Stripe test mode.**

Not a hedge. The two halves rest on different evidence:

- The code is in materially better shape than it was this morning, and the
  worst finding in the whole audit (three world-writable tables) is closed
  in the repository.
- **None of the database work is live.** Four migrations sit unapplied, and
  one of them makes a shipped feature fail completely, every week, silently.

---

## Blockers — do these before anything else

### B1 — Four migrations are unapplied, and one breaks the Sunday letter now

| migration | what it does | severity if skipped |
|---|---|---|
| `20260821120000_revoke_legacy_public_tables` | closes three world-readable, world-**writable** tables | **Critical** — an unauthenticated write primitive on a production database |
| `20260821150000_sunday_letter_sent_marker` | adds `note_sunday_sent_at` | **Critical** — see below |
| `20260821160000_legacy_tables_archive` | moves those tables out of the API schema | Medium — defence in depth |
| `20260821161000_rate_take_weighted` | the weighted limiter RPC | Low — fails open; the budget degrades to memory-only |

**The letter one is live breakage, not a missing improvement.** Pass 3's
shipped code reads the column:

```ts
.select("id, email, display_name, note_sunday_sent_at")   // note-cron.ts:151
...
if (error) { return { ok: false, sent: 0, ... } }          // :153
```

Verified against Postgres 16 rather than assumed:

```
before the migration:  ERROR:  column "note_sunday_sent_at" does not exist
after:                 (0 rows)
```

PostgREST surfaces that as an error, the guard returns `ok: false`, and
**every recipient gets nothing.** No partial send, no warning to anyone —
just a quiet Sunday. This is the audit's own doing: code and migration
shipped in one commit, and they apply at different times.

**This is the general lesson of the pass.** A migration in the repository is
not a migration in production, and the gap between them is invisible from
inside the code.

### B2 — Billing has never been exercised

Pass 6 found three High defects in payment handling and fixed all three,
but there are no Stripe keys in this environment, so **nothing in that pass
has run against Stripe.** The behaviours the fixes depend on —
retry-on-non-2xx, newest-first list ordering, `status: "all"` including
incomplete states — are documented behaviour reproduced in test doubles.

Before a stranger's card is charged: one test-mode checkout, one delivered
webhook, one cancellation. That is an hour of work and it converts the
best-argued pass in this audit into a verified one.

---

## What changed, across ten passes

| pass | the finding that mattered | proof |
|---|---|---|
| 1 Visual | hover veil inverted the tonal ladder; badges vanished on hover | measured +9.8 at rest vs −5.0 on hover, then +10.0 after |
| 2 Security | three legacy tables world-readable **and world-writable** since migration 001 | exploit reproduced on local Postgres, then blocked |
| 3 Performance | the Sunday letter could not finish; no resume marker | 102 → 6 database reads, 75 → 3 market calls |
| 4 Caching | one unauthenticated GET could cost thousands of provider calls | 1 fake ticker = 52 Yahoo calls; 50 = 1,718 → 0 on repeat |
| 5 UX | the invariant suite was **red**, so no design rule was enforced | 5 failing → 0, several rules made stronger |
| 6 Billing | webhook acknowledged events it failed to apply, discarding Stripe's retry | mutation-tested: 2 tests fail when reverted |
| 7 Onboarding | European numbers silently corrupted — `1.234,56` imported as **1.23** | before/after table, 8 tests fail when reverted |
| 8 Community | nothing wrong | 12 routes read; guard added instead |
| 9 Compliance | two projection surfaces had no framing; export omitted co-ownership | test caught the CSV half of the fix |
| 10 Legal | the checkout screen told the truth and the Terms did not | contract now matches the product |

**Three findings were withdrawn after being drafted** — Pass 2's
`account/export`, Pass 4's "unthrottled", Pass 8's `book/route.ts`. Each
looked damning as a fragment and was fine in full. They are recorded rather
than deleted, because that pattern is the most reusable thing in this
audit: **an authorization audit that reads fragments produces confident,
wrong findings.**

**One regression was mine and shipped to production.** The logo vanished
from the app bar because I replaced a PNG with inline SVG that emitted
literal gradient ids, and the lockup mounts twice per page. My first fix
was wrong — I tightened the viewBox, which was a real improvement and not
the bug. The second attempt found it by building the app, serving it, and
measuring the rendered element. That is the standard the rest of this audit
should have been held to for anything visual.

---

## Final state

```
npm run typecheck        clean
npm run lint             clean
npm test                 192 tests / 36 files   (was 142 at the start of Round 2)
npm run test:invariants   195 invariants, all passing   (was 5 failing)
npm audit --omit=dev     0 vulnerabilities
```

**Nine new guards** were added, each verified by breaking it on purpose and
watching it fail with a message that names the file:

- every community route checks membership, not just auth
- the Terms' description of Pro stays true
- SVG paint servers get per-instance ids
- the logo mark fills its box, and its lockups keep their aspect
- every text box that can fail says what happened
- plus the five rewritten design rules from Pass 5

---

## Carried forward: everything this environment could not verify

Nothing below is a pass. Each is a check that was asked for and did not
happen.

**Needs production access**
1. RLS tested from a real non-owner session (Pass 2, 8).
2. Whether the three legacy tables hold rows — the archive migration raises
   the counts as notices, so applying it answers this.
3. Real Vercel cron timings; the budget arithmetic is exact, the wall clock
   is not (Pass 3).
4. CDN hit rates, and per-IP limiting across real isolates (Pass 4).
5. Whether the disaster-recovery backup is configured, which decides whether
   a storage sub-processor needs naming in the privacy policy (Pass 10).

**Needs Stripe**
6. Everything in Pass 6 — see B2.

**Needs a browser and a real account**
7. A real signup end to end (Pass 5, 7).
8. Core Web Vitals on signed-in pages (Pass 3).
9. Touch targets on real hardware (Pass 5).
10. A real broker CSV export (Pass 7).

**Needs a person, not a pass**
11. **Legal review.** Pass 10 checked the documents against the code. Whether
    the result is *sufficient* under Estonian and EU consumer law is a
    lawyer's question.

---

## Recommended order

1. Apply the four migrations. Read the row counts the archive migration
   prints — they answer a question this audit could not.
2. Confirm the Sunday letter runs after the marker column exists.
3. Run one Stripe test-mode checkout, webhook and cancellation.
4. Then open it to people outside the family.

Steps 1–3 are hours, not days, and every one of them converts an argument
in these documents into a fact.
