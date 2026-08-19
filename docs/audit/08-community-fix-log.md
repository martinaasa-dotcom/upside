# Pass 8 — Community: fix log

One row per finding in [`08-community.md`](08-community.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

> **The Critical fix is applied and verified in production** (2026-08-19).
> The policy predicate was read back from `pg_policy` and matches the
> migration clause for clause, and a fixture test — a throwaway classroom,
> run as the student via `set local role authenticated`, rolled back —
> returned `real book blocked = yes | paper sheet allowed = yes`. Both
> branches confirmed: the bypass is closed and classrooms still work.
>
> Verifying it surfaced a new adjacent finding, **N1** below: the separate
> `_admin` policy still permits for a class admin what this fix denies for
> a student.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| C1 | RLS let a student pin their real book into a classroom, bypassing the app's own rule | Critical | **Resolved — applied and verified in production** | `supabase/migrations/20260819120000_classroom_real_book_share_rls.sql`; report §Critical 1. Verified two ways on 2026-08-19: `pg_get_expr(polwithcheck, polrelid)` for `portfell_community_portfolios_owner_insert` matches the migration clause for clause (the `kind = 'classroom'` / `classroom_community_id` branch is live), and a fixture test — throwaway classroom, run as the student via `set local role authenticated` and `request.jwt.claims`, whole block rolled back — returned `real book blocked = yes \| paper sheet allowed = yes`. | The app-side rule was already correct; this closes the direct-PostgREST path around it. The positive half of the test matters as much as the negative one: a policy that rejected everything would look "secure" while breaking every classroom, and it doesn't. See **N1** for the sibling path this verification exposed. |
| H2 | Removing or re-roling one classroom student could silently sweep in their household partner | High | **Resolved** (prior session) | Report §High 2; covered by the `classroom membership actions stay per person, not household-mirrored` invariant, which passes | Fixed when the pass was first run. |
| H3 | A private community's existence leaked through 404-vs-403 on join-request | High | **Resolved** (prior session) | Report §High 3; covered by the `a private community's existence does not leak through join-request` invariant, which passes | Fixed when the pass was first run. |
| M1 | Classroom `buy_price` is visible to every classmate, not just the teacher | Medium | **Deferred — needs Martin's decision** | — | A real product question, not a defect. The gate is `classroom`, not `isAdmin`, so every student sees every classmate's cost basis on their paper trades — server and UI agree, so this isn't a client-only slip. The code's own comment says "so the teacher can see what students actually paid", which suggests narrower intent, but compare-your-picks-with-classmates is a plausible teaching goal and this is paper money, not a real book. Changing it without asking would quietly remove a feature a teacher may be relying on. |
| M2 | The "keep at least one admin" invariant is enforced only in app code, not in RLS | Medium | **Deferred** | — | Real gap between the stated invariant and what the database allows: an admin calling PostgREST directly could demote or delete themselves as the sole admin. Self-harm only — no other member's data is exposed or altered beyond the normal effect of losing an admin. Closing it needs a trigger (analogous to `20260818223000_lock_billing_columns.sql`) and therefore **another** migration awaiting manual apply, on top of the Critical one already queued. Not worth deepening that operational debt for a self-inflicted case; revisit when the pending migration is applied. |
| **N1** (new, found while verifying C1) | The `_admin` policy re-opens the classroom hole for a class admin | Medium | **Resolved in code — needs a production apply** (`supabase/migrations/20260819150000_classroom_admin_share_rls.sql`) | `supabase/migrations/016_account_aliases_and_community_sheets.sql:69-71`: `portfell_community_portfolios_admin` is `for all using (portfell_is_community_admin(community_id)) with check (same)` — no ownership check, no classroom check, and never redefined since. RLS policies are OR'd, so it grants exactly what C1's `owner_insert` fix denies, for anyone who is an admin of that community. | Surfaced while confirming C1 landed in production, not by the original pass. Much smaller than C1: a teacher pinning their **own** real book into their own class is self-inflicted, and pinning a **student's** real book needs that portfolio's UUID, which the other policies don't expose. But `AGENTS.md`'s "Never share a real book into a class" is currently enforced against students only. Fixed by adding the same classroom clause to the admin policy's `with check` only. `using` is left permissive on purpose, so an admin can still read and **remove** a wrongly-pinned row — constraining it would take away the way out of a bad state. Circles are untouched: the `not exists (… kind = 'classroom')` branch is true for them, so the clause short-circuits and circle admins keep the control they have today. |
| L1 | A student can self-unpin their own classroom sheet via direct REST | Low | **Deferred** | — | Cosmetic and self-inflicted: it hides their sheet from the class book view but does not escape the trading-period lock, because `denyClassroomWrite` keys off `portfolios.classroom_community_id` directly, which the bypass doesn't touch. Re-pinning is one `POST /classroom-sheet` away. Same migration-cost argument as M2. |

## Deferred summary

Three items left unfixed, none silently. **M1** is a genuine product
decision for Martin about what a classroom is meant to show. **M2** and
**L1** are database-side hardening for self-inflicted cases (an admin
demoting themselves; a student hiding their own class sheet), neither of
which exposes another person's data.

**N1** was fixed rather than deferred once Martin opted into it — with
that migration written, "never share a real book into a class" now holds
against students *and* class admins. M2 and L1 remain the cheap
candidates to fold into a future migration if one is being applied
anyway.
