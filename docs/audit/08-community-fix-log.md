# Pass 8 — Community fix log (Round 2)

Companion to `docs/audit/08-community.md`.

| # | Item | Severity | Status | Evidence |
|---|---|---|---|---|
| — | No defects found | — | **No change needed** | 12 routes read; all gated |
| G1 | Nothing structurally prevented a future ungated route | Medium | **Resolved** | New invariant; verified by adding a leaking route |

## Why there is no fix list

Every community route already checks membership or admin. This is the first
pass in the Round 2 audit to find nothing wrong, and that is reported as the
result rather than padded.

One finding was drafted and withdrawn before it was written up:
`[id]/book/route.ts` appeared to serve every member's email and bio with no
membership check, until the check turned up at line 25 — above where I had
started reading. Third time in this audit that reading a fragment produced a
confident, wrong conclusion.

## G1 — the guard this pass ships instead

The exposure here is not a bug that exists; it is the one that gets added.
`getSupabaseDataClient()` returns the service role in production, which
bypasses RLS, so a route that forgets to check has **nothing else standing
behind it** — and these routes serve emails, bios, cost bases and combined
books.

The invariant walks `communities/[id]/**/route.ts` and requires
`requireAuthUser` plus `userIsCommunityMember` or `userIsCommunityAdmin` in
each. Signed-in alone does not pass: it says nothing about belonging to
*this* community.

Verified the way every guard in this audit is verified — by making it fail:

```
$ # add a route with requireAuthUser and nothing else
fail  every community route checks membership in code, not just auth
  src/app/api/communities/[id]/leaky/route.ts must check membership or
  admin -- the service role bypasses RLS, so nothing else will
```

It also asserts it found at least 9 routes, so a broken glob fails loudly
rather than passing vacuously — the failure mode that makes a
file-walking test worthless.

## Verification

`npm run typecheck` clean · `npm run lint` clean ·
`npm test` **191 tests / 36 files** · `npm run test:invariants` green.

## Unable to Verify (Environment-Blocked)

1. **No live cross-tenant attempt** from a real non-member session.
2. **The invariant proves the gate is called, not that it is correct** —
   `userIsCommunityMember` is read, not exercised against a database.
