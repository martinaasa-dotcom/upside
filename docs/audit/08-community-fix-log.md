# Pass 8 — Community: fix log

One row per finding in [`08-community.md`](08-community.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

> **Operational follow-up, still open.** The Critical fix below is
> written (code **and** migration) but the migration has not been applied
> to the production database. Until it is, the RLS half of that fix isn't
> live. This is item #3 in `00-summary.md`'s decision list and belongs at
> the top of Martin's list regardless of when he reads this.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| C1 | RLS let a student pin their real book into a classroom, bypassing the app's own rule | Critical | **Resolved in code — needs a production migration apply** | `supabase/migrations/20260819120000_classroom_real_book_share_rls.sql`; report §Critical 1 | Written when the pass first ran and merged to `main`. The app-side rule was already correct; this closes the direct-PostgREST path around it. Not effective in production until the migration is applied. |
| H2 | Removing or re-roling one classroom student could silently sweep in their household partner | High | **Resolved** (prior session) | Report §High 2; covered by the `classroom membership actions stay per person, not household-mirrored` invariant, which passes | Fixed when the pass was first run. |
| H3 | A private community's existence leaked through 404-vs-403 on join-request | High | **Resolved** (prior session) | Report §High 3; covered by the `a private community's existence does not leak through join-request` invariant, which passes | Fixed when the pass was first run. |
| M1 | Classroom `buy_price` is visible to every classmate, not just the teacher | Medium | **Deferred — needs Martin's decision** | — | A real product question, not a defect. The gate is `classroom`, not `isAdmin`, so every student sees every classmate's cost basis on their paper trades — server and UI agree, so this isn't a client-only slip. The code's own comment says "so the teacher can see what students actually paid", which suggests narrower intent, but compare-your-picks-with-classmates is a plausible teaching goal and this is paper money, not a real book. Changing it without asking would quietly remove a feature a teacher may be relying on. |
| M2 | The "keep at least one admin" invariant is enforced only in app code, not in RLS | Medium | **Deferred** | — | Real gap between the stated invariant and what the database allows: an admin calling PostgREST directly could demote or delete themselves as the sole admin. Self-harm only — no other member's data is exposed or altered beyond the normal effect of losing an admin. Closing it needs a trigger (analogous to `20260818223000_lock_billing_columns.sql`) and therefore **another** migration awaiting manual apply, on top of the Critical one already queued. Not worth deepening that operational debt for a self-inflicted case; revisit when the pending migration is applied. |
| L1 | A student can self-unpin their own classroom sheet via direct REST | Low | **Deferred** | — | Cosmetic and self-inflicted: it hides their sheet from the class book view but does not escape the trading-period lock, because `denyClassroomWrite` keys off `portfolios.classroom_community_id` directly, which the bypass doesn't touch. Re-pinning is one `POST /classroom-sheet` away. Same migration-cost argument as M2. |

## Deferred summary

Three items left unfixed, none silently. **M1** is a genuine product
decision for Martin about what a classroom is meant to show. **M2** and
**L1** are both database-side hardening for self-inflicted cases, and
both would add another migration to a queue that already has one
unapplied — the honest sequencing is to land the Critical migration
first, then decide whether these are worth their own.
