# Pass 8 — Community Audit

Scope: the community/circle system end to end — every `INSERT` into
`portfell_community_members`, role/permission enforcement on
`/api/communities/*` (row-level checks and the RLS policies backing them),
visibility leakage between private/public communities, household-mirroring
correctness (`portfell_household_groups`, migration `053`), classroom
isolation (real-book leakage, server-side `class_plan` enforcement), and
admin actions (remove member, delete community) for missing authorization or
orphaned data. Read against `AGENTS.md` and `docs/AUTH_AND_COMMUNITIES.md`
first — invite-redemption races were already confirmed race-safe in Pass 7
and are not re-litigated here; this pass sits one layer up, in
membership/role/visibility logic.

Branch: `claude/audit-community`, based on `origin/main` @ `7223669`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 1 | 1 (code + migration written; **migration needs manual apply to production**) |
| High | 2 | 2 |
| Medium | 2 | 0 (backlog) |
| Low | 1 | 0 (backlog) |

`npm run typecheck` and `npx eslint --max-warnings 0 --ignore-pattern
'.claude/**'` are clean after the fixes. `npx tsx
scripts/test-invariants.ts` shows the same 2 pre-existing, unrelated
failures named in the task (`circle awards are a grid of cards, not a flat
divided list`, `Fund page labels Margus's note Thesis`) and nothing new; two
new invariants were added to pin both High-severity code fixes.

---

## Critical

### 1. RLS let a student pin their real book into a classroom, bypassing the app's own rule — needs a production migration

**Where:** `portfell_community_portfolios_owner_insert` policy, most
recently redefined in `supabase/migrations/043_rls_grants_oracles_initplan.sql:250-261`
(originally `037_circle_share_and_house_note.sql`).

**What's wrong:** the row that makes a portfolio visible inside a community
(`portfell_community_portfolios`) is guarded, at the database level, by a
policy that checks only two things: the caller is a member of the target
community, and the caller owns the portfolio being pinned. Nothing in the
policy ties the pin back to whether the *community* is a classroom, or
whether the *portfolio* is that classroom's own paper sheet
(`portfolios.classroom_community_id`). The app-layer route that normally
mints these rows (`POST /api/communities/[id]/sheets`,
`src/app/api/communities/[id]/sheets/route.ts:119-142`) does refuse to
share a real sheet into a class ("This class only shows the paper sheet you
were given"), and `shareOwnedSheetsIntoCommunity`
(`src/lib/community-share.ts:33-40`) skips classrooms entirely — but
neither of those is a database constraint, and this app ships its Supabase
URL and anon key to the browser (`NEXT_PUBLIC_SUPABASE_URL` /
`_ANON_KEY`, `src/lib/supabase/env.ts:23,30`) with every signed-in user
carrying their own session JWT. A student enrolled in a class can open dev
tools and call PostgREST directly:

```
POST /rest/v1/portfell_community_portfolios
{ "community_id": "<their class>", "portfolio_id": "<their real book>" }
```

RLS alone would accept it — they're a member of that community and they do
own that portfolio. Their real holdings and real cost basis (the classroom
book view intentionally shows *real* `buy_price` for classroom communities
so a teacher can grade what students actually paid —
`src/app/api/communities/[id]/book/route.ts:169-174`) would then be visible
to their teacher and every classmate. This is exactly the failure mode
`AGENTS.md` calls out by name: "Never share a real book into a class," and
it's the same class of bug migration `028` already fixed once for
`portfell_community_members` (self-insert with no tie-back to the specific
row) — this is the same hole, one table over, that `028` didn't reach
because `portfell_community_portfolios` didn't exist until migration `016`/`037`.

**Fix:** `supabase/migrations/20260819120000_classroom_real_book_share_rls.sql`
(new) redefines `portfell_community_portfolios_owner_insert` to add: for a
classroom community, the portfolio being pinned must have
`classroom_community_id` equal to that same community — i.e. only a
student's own homework sheet, never an arbitrary owned real portfolio.
Circles are unaffected (unchanged member+owner check). The legitimate paths
(`provisionClassroomSheet` pinning a freshly-provisioned class sheet, the
admin "for all" policy for teacher actions) still satisfy the new check
trivially, since those pins already set `classroom_community_id` on the
portfolio before pinning it.

**This migration is written but has not been applied to production** — this
sandbox has no production Supabase credentials (per `AGENTS.md`,
`SUPABASE_SERVICE_ROLE_KEY` for `uzrnybyggznpvgxgrvgl` lives on Vercel, not
here). Someone with production access needs to run it (see
`docs/ZERO_DOWNTIME_MIGRATIONS.md` / `scripts/migrate-online.ts` for the
house process) before this hole is actually closed live. Until then, the
app-layer guard (`/sheets` route, `shareOwnedSheetsIntoCommunity`) is the
only thing stopping this in production — real, but bypassable exactly as
described above.

---

## High

### 2. Removing or re-roling one classroom student could silently sweep in their household partner too

**Where:** `resolveTargetUserIds` in
`src/app/api/communities/[id]/members/[userId]/route.ts:23-73` (used by
both `PATCH` — admin role change — and `DELETE` — admin removal or
self-leave).

**What's wrong:** this helper resolves a `person_id` (or raw `user_id`) to
every `user_id` an admin action should apply to. It correctly collapses
Google-alias logins (Martin's two sign-ins are one person, via
`expandPersonUserIds`), but it then unconditionally also expanded to
**household partners** (`expandHouseholdUserIds` — Martin↔Amanda,
Rasmus↔Karoliine) regardless of what kind of community was being acted on.
The DB-side mirror trigger that inspired this helper
(`portfell_mirror_household_community_member`, migration `053`) explicitly
excludes classrooms (`if ... c.kind = 'classroom' then return`,
`20260816132758_053_household_community_pairs.sql:49-56`), and
`AGENTS.md`/`docs/AUTH_AND_COMMUNITIES.md` both say plainly "classrooms stay
per person" — but this app-side helper had no equivalent guard. Concretely:
Rasmus and Karoliine are two separate people who can independently enroll as
two separate students in the same classroom. A teacher removing Rasmus for
one reason (or Rasmus leaving on his own) would resolve `targetIds` to
`[Rasmus, Karoliine]` — because `resolveTargetUserIds` looked up Rasmus's
household group and found Karoliine's profile by email, with no check that
this was a classroom — silently also evicting Karoliine from the class and
unpinning/un-locking her homework sheet (`classroom_community_id: null`),
even though she never asked to leave and the teacher never removed her.

**Fix:** `resolveTargetUserIds` now fetches the community's `kind`
alongside its members, and returns immediately after alias-login expansion
— before the household lookup — when the community `isClassroomKind`. Circle
behavior (the intended household mirroring) is unchanged.

### 3. A private community's existence leaked through 404-vs-403 on join-request

**Where:** `src/app/api/communities/[id]/join-request/route.ts:35-48`
(`handlePOST`).

**What's wrong:** requesting to join a community by id returned `404 "Not
found"` when the id didn't match any community, but `403 "This community is
invite-only"` when the id matched a real *private* community. Those two
responses are distinguishable, so anyone who merely came into possession of
a private community's UUID — a pasted link, a screenshot, a URL bar over
someone's shoulder — could confirm it's a real community without ever being
shown its name, without being a member, and without an admin ever inviting
them. `GET /api/communities/discover` correctly excludes private
communities entirely (`.eq("visibility", "public")`,
`src/app/api/communities/discover/route.ts:29`) and `GET
/api/communities/[id]` already collapses "doesn't exist" and "not a member"
into the same `403 "Not a member"` regardless of order
(`src/app/api/communities/[id]/route.ts:40-42`) — this route was the one
place that didn't follow the same pattern.

**Fix:** collapsed both branches into a single response —
`!community || visibility !== "public"` now always returns `403 "This
community is invite-only"`. Existence and privacy are indistinguishable to
a caller either way. The existing `plain-error.ts` copy mapping ("This
circle is invite-only.") is unchanged, so the one legitimate case that
still reaches this message client-side (a community flips private between
page load and click) reads exactly as before.

---

## Medium (backlog — not fixed this pass)

- **Classroom `buy_price` is visible to every classmate, not just the
  teacher, and the code's own comment suggests that wasn't the intent.**
  `src/app/api/communities/[id]/book/route.ts:169-174`: `holdings =
  ... buy_price: classroom ? row.buy_price : 0`. For circles, cost basis is
  always zeroed out for every member; for classrooms it's left as the real
  number, with the comment "A class needs it so the teacher can see what
  students actually paid on the paper sheet" — but the check is only
  `classroom` (a boolean on the *community*), not whether the caller is the
  teacher (`isAdmin`). Every student in the class can see every other
  student's real cost basis on their paper trades via the same `/book`
  endpoint (and `CommunityView.tsx` doesn't gate the cost column on
  `isAdmin` either — this isn't a client-side-only bug, server and UI agree,
  it's just broader than the comment implies). This may be intentional
  transparency for a class assignment (compare-your-picks-with-classmates
  is a plausible pedagogical goal), or it may be an oversight where "the
  teacher" in the comment should have been an `isAdmin` check. A real
  product call either way — not touched here since it's not a violation of
  any documented rule (paper money, not a real book), just worth a
  deliberate decision.
- **The "keep at least one admin" invariant is enforced only in app code,
  not in RLS.** `src/app/api/communities/[id]/members/[userId]/route.ts`'s
  `PATCH`/`DELETE` handlers both check `remainingAdmins.length === 0` before
  demoting/removing the last admin, but the underlying RLS policy
  (`portfell_community_members_admin`, `for all using
  (portfell_is_community_admin(community_id))`) has no equivalent guard. An
  admin who called PostgREST directly (same anon-key-plus-JWT path as
  Critical #1) could demote or delete themselves as the sole admin of their
  own community, leaving it with no admin able to manage it, add invites, or
  delete it — self-harm only (no other member's data is exposed or altered
  beyond the normal effect of losing an admin), but a real data-integrity
  gap between the app's stated invariant and what the database actually
  allows. Worth a trigger analogous to the billing-column lock
  (`20260818223000_lock_billing_columns.sql`) if this is judged worth
  closing; not fixed here since it's self-inflicted rather than a
  cross-user leak.

## Low (backlog)

- **A student can self-unpin their own classroom sheet via direct REST,
  bypassing the app's "stays in the circle" rule.** The `DELETE` RLS policy
  on `portfell_community_portfolios` (`portfell_community_portfolios_owner_delete`,
  `043_rls_grants_oracles_initplan.sql:265-274`) lets any portfolio owner
  unpin a sheet they own from any community, with no classroom exception —
  while the app route (`POST /api/communities/[id]/sheets` with
  `shared: false`) explicitly blocks this for a classroom sheet ("Your class
  sheet stays in the circle"). A student bypassing the app would only hide
  their sheet from the class book view, not escape the actual trading-period
  lock: server-side `class_plan` enforcement (`denyClassroomWrite`,
  `src/lib/classroom-guard.ts`) keys off `portfolios.classroom_community_id`
  directly, which this bypass doesn't touch. Cosmetic/self-harm only —
  re-pinning is one `POST /classroom-sheet` call away — not fixed here.

---

## Confirmed working (no fix needed — checked, not assumed)

- **Every `INSERT` into `portfell_community_members` in application code
  traces to one of the three legitimate triggers**, and grepping the whole
  `src/` tree for the table found no others:
  - `POST /api/communities` (`src/app/api/communities/route.ts:139-145`) —
    the creator becomes the community's own first admin. RLS backs this
    with `portfell_community_members_self_insert`
    (`028_rls_deep_sweep_hardening.sql`), scoped to "you created this
    specific community" only, since migration `028` closed the earlier
    self-escalation hole that let *any* authenticated user self-insert into
    *any* community with *any* role — re-verified still closed as of
    migration `043`'s re-statement of the same policy.
  - `PATCH /api/communities/[id]/join-request` approval path
    (`src/app/api/communities/[id]/join-request/route.ts:134-137`) — admin
    only (`userIsCommunityAdmin` gate at the top of `handlePATCH`), and a
    non-admin cannot self-approve even via direct REST: the
    `portfell_join_requests_requester_update` policy's `with check`
    requires `status = 'pending'`, so a requester can reset their own
    rejected request back to pending but can never write `'approved'`
    themselves (`031_community_visibility_join_requests.sql:62-65`).
  - `portfell_redeem_community_invite` RPC (invite link redemption,
    `044_redeem_invite_rpcs.sql` → `047`/`048`/`050`) — already verified
    race-safe in Pass 7, re-confirmed here: token possession is the only
    grant, an invite's `role` is fixed at admin-mint time (only an admin can
    mint an admin-role invite — `POST /invites` also gates on
    `userIsCommunityAdmin`), so redemption can never grant a role beyond
    what an admin already chose to offer.
  - `portfell_mirror_household_community_member` trigger (migration `053`)
    — fires on insert/update/delete of `portfell_community_members`,
    explicitly returns early for classrooms (`c.kind = 'classroom'`), and
    `portfell_sync_household_community_memberships`
    (`ensure-profile.ts:172-181`) is only called when
    `householdEmailsFor(email).length > 1` — the hardcoded household-pair
    list, not a general auto-join. Matches Pass 7's finding, re-verified.
- **Classroom `class_plan` (buy / closed / sell-and-move / open) is
  enforced server-side, not only in the UI.** Every holdings write route
  (`src/app/api/holdings/route.ts` — add, edit, delete — and
  `src/app/api/holdings/import/route.ts`) calls `denyClassroomWrite`
  (`src/lib/classroom-guard.ts`), which loads the *current* `class_plan`
  from the database, resolves the live trading period
  (`resolveClassroomTrade`), and 403s with the same plain-language message
  the UI shows if the requested action (`buy`/`sell`/`adjust`/`cash`) isn't
  allowed right now — with an explicit admin exemption
  (`userIsCommunityAdmin`) so the teacher can still edit. A student calling
  the API directly during a "closed" period gets rejected exactly like a
  browser click would; this is not a client-side-only lock.
- **Real books cannot be shared into a class through the normal app flow.**
  `shareOwnedSheetsIntoCommunity` (`src/lib/community-share.ts:33-40`)
  returns `0` immediately for classroom communities, and `POST
  /api/communities/[id]/sheets` explicitly 403s any attempt to share a
  non-class sheet into a class (`"This class only shows the paper sheet you
  were given"`, `src/app/api/communities/[id]/sheets/route.ts:130-135`).
  The one gap in this guarantee (a direct-REST bypass of the RLS layer
  behind it) is Critical finding #1 above, now fixed pending migration
  apply.
- **Classroom sheet provisioning is one-per-student, race-safe, and
  properly isolated with its own `starting_cash`.** `provisionClassroomSheet`
  (`src/lib/classroom.ts:339-448`) re-verified from Pass 7: the unique index
  `portfell_portfolios_one_class_sheet` on `(classroom_community_id,
  owner_id)` backs the check-then-insert, and a duplicate-key race
  re-selects the concurrently-created row instead of erroring. Deleting a
  classroom (`DELETE /api/communities/[id]`) leaves no orphaned data:
  `portfolios.classroom_community_id` is `references ... on delete set
  null` (`039_classroom.sql:38-40`), so every enrolled student's sheet is
  automatically un-classroomed (and becomes a normal, deletable sheet) the
  moment the class itself is deleted — matching
  `docs/AUTH_AND_COMMUNITIES.md`'s documented behavior. No app-level cleanup
  was needed or missing here.
- **Visibility leakage checked across every list/read endpoint.**
  `GET /api/communities/discover` only ever selects `visibility = 'public'`
  rows and never returns member lists, admin fields, or portfolio data —
  just id/name/house note/member count/the caller's own request status.
  `GET /api/communities/[id]`, `GET .../book`, `GET .../sheets`, and `GET
  /.../duel` all gate on `userIsCommunityMember` before touching any
  community-scoped data, and (per Critical #1's writeup, since this is the
  one place row-level checks and RLS diverge) every *other* one of these
  reads is backed by an equivalent RLS `select` policy keyed off
  `portfell_is_community_member`/`portfell_is_community_admin`, so a direct
  REST call can't see more than the app already exposes. `GET
  /api/admin/overview` (whole-platform community list, member rolls) is
  gated on `isSuperadminEmail`, not just sign-in.
- **No market-slang violations found in community-facing copy.** Grepped
  `CommunityView.tsx`, `ClassroomRoster.tsx`, `classroom.ts`,
  `community-share.ts`, `community-fun-facts.ts`, `invite-landing.ts`, and
  `email-letter.ts` against the banned list (sleeve, marks, tape,
  digestion, dry powder, beta, risk-on, drawdown, rotation, conviction as
  user-facing prose). The one hit, `maxDrawdownPct`
  (`CommunityView.tsx:3142`), is a schema/variable name only — the label a
  person actually reads is "Stretch (a rough bad year)." `conviction`
  appears only as `convictionScore`/`convictionBand` field names and a
  React key (`id: "conviction"`), never as displayed prose. Both are
  explicitly allowed under `AGENTS.md`'s "schema field names ... can stay"
  carve-out.

## Needs a decision

- The Medium-severity `buy_price` visibility question above (teacher-only
  vs. whole-class transparency on paper cost basis) is a genuine product
  call, not something this pass can resolve on its own — flagged there
  rather than guessed at.

---

## Fixes applied this pass

- `supabase/migrations/20260819120000_classroom_real_book_share_rls.sql`
  (new) — tightens `portfell_community_portfolios_owner_insert` so a
  classroom community can only be pinned to its own paper sheet, closing
  the real-book-into-a-class RLS bypass (Critical #1). **Needs manual apply
  to production** — this sandbox has no production Supabase credentials.
- `src/app/api/communities/[id]/members/[userId]/route.ts` —
  `resolveTargetUserIds` now checks the community's `kind` and skips
  household-partner expansion entirely for classrooms, so admin
  remove/re-role actions (and self-leave) stay strictly per-person there
  (High #2).
- `src/app/api/communities/[id]/join-request/route.ts:35-42` — collapsed
  the "community doesn't exist" and "community exists but is private"
  branches into one indistinguishable `403` response (High #3).
- `scripts/test-invariants.ts` — added
  `"classroom membership actions stay per person, not household-mirrored"`
  and `"a private community's existence does not leak through
  join-request"` to pin both High-severity fixes against regression.

## Checks run

- `npm run typecheck` → clean.
- `npx eslint --max-warnings 0 --ignore-pattern '.claude/**'` → clean.
- `npx tsx scripts/test-invariants.ts` → 2 failures, both pre-existing and
  named in the task brief as unrelated to this pass (`circle awards are a
  grid of cards, not a flat divided list`, `Fund page labels Margus's note
  Thesis`). No new failures; both new invariants added this pass pass.
