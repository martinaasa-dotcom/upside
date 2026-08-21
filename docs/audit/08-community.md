# Pass 8 — Community & classroom (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `3fed291` (main, after Pass 7)

> Round 2 re-derivation. Nothing in the previous `08-community.md` was
> carried over as fact.

**Headline: no defects found.** Every one of the twelve community routes
checks membership or admin in code, the invite lifecycle is sound, and the
one thing that looked like a hole on first reading turned out to be a gate
I had scrolled past. This pass ships a **structural guard** instead of a
fix, because what this surface is actually exposed to is not a bug that
exists today but a route added later that forgets.

That is the honest result. Recording it as such matters more than
manufacturing a finding — Pass 2 already noted this codebase's
authorization work is unusually careful, and this pass agrees.

---

## Why "signed in" is not enough here, and why that is the risk

```ts
export async function getSupabaseDataClient() {
  if (supabaseUsesServiceRole()) return getSupabaseServer();  // <- bypasses RLS
  return createSupabaseServerAuth();
}
```

Every community route uses this client, and in production it is the
**service role**, which bypasses RLS entirely. That is the documented
convention (`AGENTS.md`: *"Prefer `SUPABASE_SERVICE_ROLE_KEY` for API writes
(with ownership checks in code)"*) and it is a reasonable one — but it means
**the database will not catch a route that forgets to check.** There is no
second line. The code is the only gate.

These routes serve members' email addresses, display names, bios, cost
bases and the combined book. A missing check is a cross-tenant leak, not a
minor bug.

## A false alarm worth writing down

Reading `[id]/book/route.ts` from line 30, I found it querying every
member's profile — `email, display_name, avatar_url, bio` — with no
membership check anywhere in view, and started writing it up as a Critical.

The check is at **line 25**, five lines above where I began reading:

```ts
if (!(await userIsCommunityMember(auth.user.id, id))) {
  return NextResponse.json({ error: "Not a member" }, { status: 403 });
}
```

Recorded because it is the same class of mistake as Pass 2's
`account/export` false alarm and Pass 4's withdrawn "unthrottled" finding:
**an authorization audit that reads fragments produces confident, wrong
findings.** Three times now in this audit, and each time the fragment
looked damning.

---

## What passed, with evidence

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Every `[id]` route gates on membership or admin | **Pass** | All 9 route files under `communities/[id]` call `requireAuthUser` **and** `userIsCommunityMember`/`userIsCommunityAdmin`. Now enforced by an invariant rather than by this table |
| 2 | Admin-only actions really are admin-only | **Pass** | Community rename/delete (`[id]` PATCH/DELETE), invite create/list/revoke, and member role changes all check `userIsCommunityAdmin` first. Member removal additionally allows self-removal, which is leaving, not an escalation |
| 3 | No privilege escalation through invites | **Pass** | An invite can carry `role: "admin"`, but creating one is admin-gated, so a member cannot mint themselves an admin link |
| 4 | Invite double-spend | **Pass** | Email-locked invites are claimed in the same `UPDATE` that selects them (`047`), so two people racing the same link cannot both win. Open links are reusable **by design**, documented as such |
| 5 | Invite expiry defaults | **Pass** | 30 days by default; never-expiring is opt-in via `neverExpires`. The comment explains the history: "no days given" used to mean "never expires", which made a link pasted into a public repo a permanent grant |
| 6 | Redeeming cannot demote an existing admin | **Pass** | `on conflict ... do update set role = case when role = 'admin' then 'admin' else excluded.role end` — a member-role invite redeemed by an existing admin leaves them an admin |
| 7 | Token entropy | **Pass** | `randomBytes(24)` base64url — 192 bits |
| 8 | Private community existence does not leak | **Pass** | `join-request` deliberately returns 403 rather than splitting 404-vs-403, with a comment saying why. Covered by an existing invariant too |
| 9 | No auto-join on sign-in | **Pass** | Re-verified from Pass 7: no `insert`/`upsert` into `portfell_community_members` outside the invite and join-request paths. `ensure-profile.ts`'s only community call is the household mirroring `AGENTS.md` permits |
| 10 | Classroom isolation | **Pass** | Existing invariants cover per-person classroom membership (no household mirroring), a student being unable to self-unpin, and a classmate's cost basis staying private |

## Checked, and deliberately left alone

**The raw invite token is stored next to its hash.**
`portfell_community_invites` carries both `token_hash` and `token`
(migration `20260817200329`), so an admin can copy a live link again.

Worth stating plainly: this means `token_hash` provides **no protection at
rest**. If that table is ever read — a backup, a future over-permissive
policy — the hash is decorative, because the working token is in the next
column.

Not filed as a finding. It is a deliberate, documented product tradeoff, the
raw token is only ever returned to admins (`invites` GET is admin-gated),
and reaching the table at all already requires the service role. Recorded so
a future pass does not "discover" the hash and assume it is doing work it
is not.

---

## What this pass ships

An invariant: **`every community route checks membership in code, not just
auth`**. It walks every `route.ts` under `communities/[id]`, and requires
each to call `requireAuthUser` *and* one of
`userIsCommunityMember`/`userIsCommunityAdmin`.

`requireAuthUser` alone deliberately does not pass. Being signed in says
nothing about belonging to *this* community, and that is exactly the
mistake the service-role convention leaves unguarded.

**Verified by adding a route that would leak.** A handler with
`requireAuthUser` and nothing else:

```
fail  every community route checks membership in code, not just auth
  src/app/api/communities/[id]/leaky/route.ts must check membership or
  admin -- the service role bypasses RLS, so nothing else will
```

Green again once removed. It also asserts it found at least 9 routes, so a
broken path glob fails loudly instead of passing vacuously.

---

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **No live cross-tenant testing.** The brief asks for attempted
   exploitation from a non-member session; there is no Supabase project to
   attempt it against. Every conclusion is derived from the code.
2. **The invariant proves a gate is *called*, not that it is correct.**
   `userIsCommunityMember` itself is read, not exercised against a real
   database.
3. **Household mirroring and classroom provisioning** are covered by
   existing invariants at the source level, not by running the RPCs.
