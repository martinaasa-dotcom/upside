# Pass 7 — Onboarding Audit

Scope: the first-run experience end to end — Google SSO sign-in and its
error paths, the "add your first holding" empty state (manual, CSV,
screenshot, paste), invite redemption (circle, household, classroom,
sheet co-owner) including race conditions on single-use tokens, the
(currently disabled) experience-tier onboarding wizard's data-loading
logic, first-session dashboard behavior with zero holdings, and
onboarding-adjacent copy against the "no market slang" rule. Read against
`AGENTS.md` first — in particular the 2026-08-18 note that
`experience_tier`/`knows_options` gating is deliberately, temporarily
disabled (`ONBOARDING_DISABLED = true` in
`src/components/ExperienceOnboardingGate.tsx`, `TIER_HIDDEN_META_TABS`/
`TIER_HIDDEN_LAB_TABS` emptied in `src/lib/experience-tier.ts`) — not
flagged as a bug below, and community membership stays strictly opt-in
(`docs/AUTH_AND_COMMUNITIES.md`, migration `030`) — verified, not
re-litigated.

Branch: `claude/audit-onboarding`, based on `origin/main` @ `3a61b08`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 0 | — |
| High | 3 | 3 |
| Medium | 3 | 0 (backlog) |
| Low | 1 | 0 (backlog) |

`npm run typecheck` and `npx eslint --max-warnings 0 --ignore-pattern
'.claude/**'` are clean after the fixes. `npx tsx
scripts/test-invariants.ts` shows the same 2 pre-existing, unrelated
failures named in the task (`circle awards are a grid of cards, not a
flat divided list` and `Fund page labels Margus's note Thesis`) and
nothing new.

---

## High

### 1. The Supabase-hosted OAuth callback silently dropped sign-in failures — no message, just back to square one

**Where:** `src/app/auth/callback/route.ts`.

**What's wrong:** the app has two Google sign-in paths. The primary one,
own-domain OAuth (`src/app/auth/google/callback/route.ts`, used on the
canonical `upsidelab.app` host and local dev whenever `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` are set), already redirects to
`/login?signin=failed` on every failure mode — missing `code`, state
mismatch, token exchange error, Supabase sign-in error — and
`SignInGate.tsx` shows a plain "Google sign-in didn't finish. Try again."
banner for that query param. The fallback path, Supabase-hosted OAuth
(`src/app/auth/callback/route.ts` — used on every Vercel preview
deployment per `shouldUseOwnGoogleOAuth()` in
`src/lib/auth/google-oauth.ts`, and anywhere `GOOGLE_CLIENT_ID`/`_SECRET`
aren't configured), did not: if `code` was missing entirely (Google
appends `?error=access_denied&…` instead of `?code=…` when someone
declines the consent screen) or `exchangeCodeForSession(code)` returned an
error (expired/replayed code, network hiccup), the old code only
`console.error`'d and then fell straight through to
`return NextResponse.redirect(new URL(next, origin))` — silently sending
a not-actually-signed-in person back to `next` (usually `/`), where they'd
just see the sign-in screen again with zero indication anything went
wrong. Anyone testing a preview deploy, or any environment running without
`GOOGLE_CLIENT_ID` configured, who declines Google's consent screen or hits
a flaky exchange gets exactly the dead end this pass was asked to look
for: click "Continue with Google," land back on the same screen, no error,
no hint the button is doing anything at all.

**Fix:** `src/app/auth/callback/route.ts` now mirrors the own-domain
callback's behavior: no `code` → `signInFailedUrl(origin)`; no configured
Supabase client → `signInFailedUrl(origin)`; `exchangeCodeForSession`
error → `signInFailedUrl(origin)` (same helper the own-domain path already
imports from `src/lib/auth/google-oauth.ts`). Only a genuine success falls
through to the original `next` redirect. `scripts/test-invariants.ts`'s
existing `assert.match(callback, /safeInternalPath/)` check still holds —
`safeInternalPath` is still used for the success path.

### 2. Sheet co-owner invite landing hid its retry form the moment a URL had a code — so a failed invite was a true dead end

**Where:** `src/app/account/join/page.tsx:70` (was `{!code && (…)}`).

**What's wrong:** `/account/join?code=…` is what a partner lands on from
an "Invite a partner" link (`InvitePartnerModal.tsx`). The page
auto-submits the URL's `code` on mount. If redemption fails — the invite
was already used, it expired, or the link got truncated by an email
client — the effect sets `error` and shows it, but the manual
paste-a-code form was gated on `{!code && (…)}`. Since `code` comes from
`useSearchParams()` and is never cleared, that condition stayed `false`
forever once a `code` was present in the URL, regardless of whether
redemption succeeded or failed. A person whose invite failed for any
reason saw the error text and *nothing else on the page they could do* —
no input to try a different/newer code, no retry button, no link out.

**Fix:** changed the guard to `{(!code || error) && (…)}` — the paste
form now also appears whenever redemption errored, prefilled with the
same code (via `useState(code)`) so they can edit and resubmit, or paste a
fresh one their partner sends.

### 3. Circle/classroom invite landing had no recovery UI at all on failure

**Where:** `src/app/communities/join/page.tsx`.

**What's wrong:** same shape of bug as #2 but worse — this page never had
a retry form to begin with (community/classroom tokens aren't
manually-typeable elsewhere in the UI), so any failure (revoked invite,
expired link, wrong Google account signed in, a genuinely broken token)
left the person looking at a static red error sentence with no button, no
link, nothing to click. `SignInGate` wraps this page, so it's only
reachable *after* a successful sign-in — meaning this dead end sits right
at the end of "click invite link → sign in with Google → stuck," which is
exactly the failure mode this pass was scoped to find.

**Fix:** added a "Go to Upside Lab" button (`Button asChild` → `Link
href="/"`) that appears alongside the error text, so there's always a way
out to the signed-in app instead of a dead page.

---

## Medium (backlog — not fixed this pass)

- **`ExperienceOnboardingGate.tsx:94–138`: the disabled wizard's own
  data-loading logic can silently overwrite a returning user's real tier
  choice.** Walking the effect: if `GET /api/account/experience-tier`
  fails to return a `tier` string for any reason unrelated to whether the
  person ever answered (a transient network blip, a brief auth hiccup,
  the row genuinely missing because an earlier `postJsonOrQueue` never
  flushed), and that same person already has `holdingsCount > 0` (line
  122's `shouldSkipExperienceOnboarding`), lines 127–138 unconditionally
  run `saveStoredTier("investor")` and POST it to the server —
  overwriting whatever tier `localStorage` actually held (e.g. "novice"
  or "advanced") with "investor," with no check against the `stored`
  value already read at the top of the effect. Today this is harmless:
  `ONBOARDING_DISABLED` means the wizard never renders regardless of
  `skip`, and `TIER_HIDDEN_META_TABS`/`TIER_HIDDEN_LAB_TABS` are empty, so
  the tier value drives no visible UI difference either way. The moment
  either is re-enabled, though, this becomes a real bug: a returning
  "advanced" user could have their tier silently downgraded by an
  unrelated fetch failure, and see the wrong tabs hidden with no wizard
  ever having asked them anything new. Worth a real fix before
  re-enabling (the obvious one: only auto-set "investor" when `stored` is
  also falsy, i.e. genuinely never-answered) — not touched here per the
  brief's instruction not to fix the disabled gate speculatively.
- **`src/lib/csv-import.ts`'s paste parser doesn't do what its own
  docstring says.** The comment on `parseHoldingsPaste`
  (`csv-import.ts:203–207`, "Price is optional (uses 0.01 as a
  placeholder so the row can land; they can fix cost after)") describes a
  feature the implementation doesn't have: `csv-import.ts:241–249`
  requires `isSafePositiveMoney(buyPrice)` and skips the row with "Need a
  buy price after the share count" if it's missing, no placeholder is
  ever substituted. The error message is honest and plain-English (not a
  broken flow), but it means the fast "just get my tickers and share
  counts in, I'll fix cost basis later" path the comment promises doesn't
  actually work — someone pasting `NBIS 500` (no price, e.g. copying
  straight from a position list that doesn't show cost) gets the whole
  line skipped instead of landed with a $0.01 placeholder. Either
  implement the placeholder or correct the comment; a real product call
  either way, not a mechanical fix.
- **Invite-flow copy says "community" where the rest of the product UI
  says "Circle."** `src/lib/invite-landing.ts:38` ("You've been invited
  to join a community."), `src/lib/email-letter.ts:156`, and
  `src/app/api/communities/[id]/invites/route.ts:102` all fall back to
  "a community" for the generic (unnamed) case, but
  `src/components/CommunitiesList.tsx:244` titles the whole feature
  "Circle" and its own tab uses that word too. Not confusing exactly (an
  invite for "a community" is legible), just an inconsistent noun for the
  same concept a brand-new person meets in their first minute in the app.
  Small copy pass, not touched here since it's cosmetic and outside the
  fix-inline bar.

## Low (backlog)

- The generic (no-name) community invite copy also differs slightly in
  wording between the in-app landing page (`inviteLandingCopy`, "Then the
  community opens") and the email (`communityInviteCopy`, "pick which
  portfolios to share"/"you get a paper portfolio to work from") —
  harmless since they're never shown to the same person side by side, but
  worth a single source of truth if this copy needs a legal or tone pass
  later.

---

## Confirmed working (no fix needed — checked, not assumed)

- **Invite redemption races are handled correctly, not just by
  accident.** `portfell_redeem_portfolio_invite`
  (`supabase/migrations/044_redeem_invite_rpcs.sql`) claims the invite row
  in a single `UPDATE … WHERE accepted_at is null … RETURNING`, so two
  simultaneous redeems of the same sheet co-owner code can only ever have
  one winner — the second gets `inv.id is null` → `"Invalid invite"`.
  Community invites were deliberately made reusable in
  `047_reusable_community_invites.sql` / `050_community_invite_uses.sql`
  ("Open / allowlist links stay reusable" — a real product decision, not
  a bug), and that path is idempotent instead of exclusive: both the
  membership insert and the `portfell_community_invite_uses` insert use
  `on conflict … do nothing`/`do update`, so N simultaneous redeems by the
  same person converge on one membership row, and N different people can
  legitimately all use the same open link. **Classroom sheet
  provisioning is also race-safe**, and not by luck either:
  `provisionClassroomSheet` (`src/lib/classroom.ts:339–448`) does a
  check-then-insert on the portfolio row, which *would* be a TOCTOU race
  under a naive read — but `039_classroom.sql:42–44` backs it with a real
  DB constraint, `portfell_portfolios_one_class_sheet`, a unique index on
  `(classroom_community_id, owner_id)`. The application code anticipates
  the resulting constraint violation explicitly
  (`classroom.ts:406–419`, `/duplicate|unique/i.test(pErr.message)`) and
  re-selects the row a concurrent request already created instead of
  erroring — a two-tab or double-click join can never leave a student
  with two homework sheets in the same class.
- **CSV import handles bad input gracefully, with plain-language errors
  throughout.** `parseHoldingsCsv`/`parseHoldingsPaste`
  (`src/lib/csv-import.ts`) never throw past `CsvImportModal.tsx`'s own
  `.catch()`; every skip reason is a plain sentence ("Don't recognize
  that ticker," "Share count is missing, isn't a number, or is enormous")
  rather than a raw parser error, and the modal surfaces up to 10 skipped
  rows with line numbers instead of silently dropping them. A completely
  unparseable file (wrong headers, empty, binary garbage that still reads
  as text) correctly falls through to "Couldn't find Ticker, Shares, and
  Buy Price columns in the header row" rather than a stack trace or a
  blank screen.
- **`EmptyBook` (`src/components/OverviewDashboard.tsx:145–285`), the
  real first-run screen since the tier wizard is disabled, is well-built**
  — CSV upload, screenshot import, manual add, and a paste-holdings
  textarea, each with a plain-English hint, matching Pass 5's earlier
  assessment and re-verified here. CSV import is genuinely discoverable
  (one of three routes on the empty state, not buried in a menu) and
  works for people who aren't Martin's family, per `AGENTS.md`'s
  requirement.
- **`ExperienceOnboardingModal.tsx` correctly has no `onClose` wired to
  `ViewportOverlay`, and that's intentional, not a gap.**
  `ViewportOverlay`'s own docstring
  (`src/components/ui/ViewportOverlay.tsx:21–26`) says to omit `onClose`
  "for a dialog that must not be dismissed (e.g. a forced first-run
  step)" — exactly this modal's role. It still isn't a dead end: every
  stage (`app`/`stocks`/`watchlist`/`email`) has a "Skip for now" or
  "Continue" button, so a keyboard user can always progress to `welcome`
  without a mouse, and the shared Tab-trap + `role="dialog"
  aria-modal="true"` from Pass 5's fix still apply regardless of
  `onClose`. `CsvImportModal.tsx` and `InvitePartnerModal.tsx` — the two
  other onboarding-adjacent modals — both pass `onClose` correctly and
  get full Escape-to-close behavior.
- **Community membership stays opt-in through every onboarding path
  checked.** `ensureProfileAndClaims` (`src/lib/auth/ensure-profile.ts`)
  only inserts community rows through
  `portfell_sync_household_community_memberships`, gated on
  `householdEmailsFor(email).length > 1` — the hardcoded household-pair
  list from `AGENTS.md`, not a general auto-join. No other code path in
  the sign-in/onboarding flow inserts into
  `portfell_community_members` outside an accepted invite (RPC-gated) or
  an admin-approved join request, matching migration `030`'s intent.
- **No market slang in anything a brand-new person reads.** Grepped
  `src/lib/invite-landing.ts`, `src/lib/invite-emails.ts`,
  `src/lib/email-letter.ts`, `ExperienceOnboardingModal.tsx`,
  `OverviewDashboard.tsx`, `SignInGate.tsx`, and `CsvImportModal.tsx`
  against the banned list (sleeve, marks, tape, conviction, digestion, dry
  powder, beta, risk-on, drawdown, rotation) — the only hit was
  `recordWeekMark`/`week-marks`, an internal function/module name for a
  weekly-high/low feature, never rendered to a person. "Thesis" appears
  correctly per the allowed exception (Pulse badges).
- **Sign-in's own error/edge-case handling is otherwise solid.**
  `SignInGate.tsx` shows a proper `role="alert"` message for
  `?signin=failed`, a one-time post-deletion notice for
  `?accountDeleted=full|data`, requires an explicit 13+ checkbox before
  the sign-in button activates, and degrades to rendering children
  immediately when Supabase isn't configured (local/demo mode) rather
  than hanging. `AuthProvider.tsx`'s `refresh()` keeps the last-known user
  on a network timeout instead of bouncing someone to sign-in on a flaky
  connection, and correctly purges per-user local caches
  (`purgeClientSession()`) whenever the signed-in account differs from
  the browser's last one — a real leak-prevention path for a shared
  device, re-verified as still correct.

## Needs a decision

None. The two ambiguous-looking items (the CSV paste placeholder-price
promise, and "community" vs. "Circle" wording) both resolved into
concrete Medium-backlog items above rather than requiring a call before
they could be assessed — neither blocks a person, both are product-copy
calls better made deliberately than guessed at inside this pass.

---

## Fixes applied this pass

- `src/app/auth/callback/route.ts` — redirect to `signInFailedUrl()`
  (missing/invalid `code`, unconfigured Supabase client, or a token
  exchange error) instead of silently falling through to `next` with the
  person still signed out (High #1).
- `src/app/account/join/page.tsx:70` — show the manual invite-code paste
  form whenever redemption errors, not only when the URL had no code
  (High #2).
- `src/app/communities/join/page.tsx` — added a "Go to Upside Lab"
  recovery button on the error state (High #3).

## Checks run

- `npm run typecheck` → clean.
- `npx eslint --max-warnings 0 --ignore-pattern '.claude/**'` → clean.
- `npx tsx scripts/test-invariants.ts` → 2 failures, both pre-existing and
  named in the task brief as unrelated to this pass (`circle awards are a
  grid of cards, not a flat divided list`, `Fund page labels Margus's note
  Thesis`). No new failures. No invariant assertions needed updating —
  `grep`ed `test-invariants.ts` for the three changed files
  (`auth/callback`, `account/join`, `communities/join`); the only pinned
  assertions touching them (`safeInternalPath` usage in `auth/callback`,
  `rememberJoinedCommunity`/`saveLastCircleId` usage in
  `communities/join`) still hold unchanged.
