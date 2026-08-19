# Pass 9 — Compliance Audit

Scope: GDPR data rights (erasure, access, rectification), backup/retention
policy, financial-advice framing across every AI-generated-content surface,
cookie/tracking consent, age/eligibility for the classroom feature, and
data minimization in logging/telemetry paths. Distinct from Pass 10
(Legal), which covers the ToS/Privacy Policy documents themselves —
document-only gaps found here are flagged for that pass, not rewritten
here. Read against `AGENTS.md` and the Pass 6 billing report (which
already covers the Stripe-cancel-on-delete fix) first.

Branch: `claude/audit-compliance`, based on `origin/main` @ `e8069f9`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 0 | — |
| High | 1 | 0 (needs a decision) |
| Medium | 2 | 0 (1 needs a decision, 1 backlog) |
| Low | 2 | 1 |

The headline finding of this pass is not a code bug: the GDPR erasure and
export machinery in this codebase is already unusually thorough (a
dedicated `20260817124031_gdpr_hard_delete_cash_events.sql` migration,
literally titled "GDPR hard-delete," already exists on `main`), and the
in-app deletion/export paths cascade and scrub correctly everywhere this
pass checked. The one real gap is outside the app's own database entirely:
the encrypted disaster-recovery cold copies uploaded nightly to Cloudflare
R2 have no retention or expiry policy at all, for anyone, and are never
touched by account deletion. That is a genuine "needs a decision" per the
task brief, not something to fix unilaterally.

---

## High

### 1. R2 disaster-recovery cold copies have no retention policy and are never purged for a deleted account — needs a decision

**Where:** `src/lib/dr/export-book.ts` (`exportEncryptedBook`,
`runDisasterRecoveryJob`), `src/app/api/cron/disaster-recovery/route.ts`,
`docs/DISASTER_RECOVERY.md`.

**What's wrong:** every night at 03:00 UTC, `/api/cron/disaster-recovery`
encrypts a full snapshot of **every sheet's cash and holdings across every
user** and `PUT`s it to Cloudflare R2 (or S3) at a new, permanent,
timestamped key (`.../book-snapshots/YYYY/MM/DD/book-<iso>.json.ulenc`).
There is no lifecycle rule, expiry, or pruning step anywhere in this
codebase or in `docs/DISASTER_RECOVERY.md` — unlike the in-database
nightly snapshot (`portfell_book_snapshots`), which `pruneOldSnapshots()`
caps at a 14-day window (`NIGHTLY_SNAPSHOT_WINDOW` in
`src/lib/book-snapshot.ts`), every R2 cold copy accumulates forever for
every user, active or not.

Two separate compliance problems follow from this:

- **Storage limitation (GDPR Art. 5(1)(e))**: even for a user who never
  deletes their account, their financial data sits in an unbounded number
  of daily encrypted backups indefinitely, with no stated retention
  period anywhere (checked `docs/DISASTER_RECOVERY.md` in full and
  `src/app/privacy/page.tsx` §7 — neither mentions R2 cold copies or gives
  any duration).
- **Right to erasure**: `portfell_purge_user_data()` (the SQL function
  behind self-service account deletion) scrubs the *in-database*
  `portfell_book_snapshots` payloads for a deleted user's sole-owned
  portfolios (`portfell_scrub_snapshot_payload`), but has no way to reach
  R2 at all — it's a different storage system, outside Postgres, that the
  deletion RPC never talks to. A person who exercises their right to
  erasure still has their cash/holdings data sitting in however many
  months or years of past R2 objects, encrypted but intact.

**Why this isn't fixed inline:** this is exactly the kind of finding the
task brief calls out as not mine to unilaterally resolve. Fixing it
requires a product/legal decision on **what retention period is
acceptable** (30 days? 90 days? matching some other operational SLA?),
and the two candidate implementations have real tradeoffs that also need
a decision: (a) an R2 bucket lifecycle rule (pure Cloudflare console
config, not code, and not visible/settable from this sandbox), or (b) an
additional cron step that lists and deletes objects older than a cutoff.
Neither approach can *selectively* remove one deleted user's data from an
already-encrypted, checksummed, whole-book blob shared with everyone
else's data for that night — the practical fix is bounding how long
*any* cold copy lives, not per-user redaction, and that's a retention
policy decision, not a bug fix. Flagged for Martin to decide; see "Needs
a decision" below.

---

## Medium

### 1. Privacy policy doesn't disclose the R2 cold-copy channel or state any concrete retention duration — for Pass 10

**Where:** `src/app/privacy/page.tsx` §7 ("Data retention").

**What's wrong:** the existing retention section says "Nightly snapshots
of book data are kept for backup and recovery... Only the people who run
the app can read a restore" — this reads as if it's describing the
in-database nightly snapshot only, and gives no duration for anything.
The separate, longer-lived R2 cold-copy channel (`disaster-recovery`
cron, see High #1) isn't mentioned at all, and once a retention period is
decided there, it belongs in this section. This is a document change, so
it's explicitly Pass 10's territory — flagging the gap here rather than
touching `privacy/page.tsx`, since this pass is compliance, not legal
copy.

### 2. GDPR export omits `portfell_community_invite_uses` — minor right-to-access completeness gap

**Where:** `src/lib/gdpr/user-export.ts` (`collectUserExport`).

**What's wrong:** the export pulls `profile`, `settings`, `portfolios`,
`holdings`, `cash_events`, `snapshots`, `lab_state`, `communities`,
`community_duels`, `join_requests`, and `portfolio_invites`, but never
queries `portfell_community_invite_uses` (`invite_id, user_id, used_at` —
"which invite link you redeemed, and when," added in migration `050`).
It's a small, low-sensitivity table (no content beyond a join fact and a
timestamp), and the person can already see their current community
memberships via the `communities` section of the same export, so this
isn't blocking — but a literal reading of "right to access" covers it too.
Backlog: add a fourth query (`.select("invite_id, used_at").eq("user_id", uid)`,
joined to portfolios owned to scope which invites are theirs to see) to
`collectUserExport`.

---

## Low

### 1. `PulsePage.tsx`'s disclaimer was a duplicated string literal instead of the shared constant — fixed

**Where:** `src/components/PulsePage.tsx:1109` (before this pass).

**What's wrong:** `src/lib/disclaimer.ts` exists specifically so
"if the wording needs to change for legal reasons, it should only need to
change here" — every other advice-adjacent surface
(`ForecastPanel.tsx`, `UpsidePortfolioPage.tsx`, `CcAdvisorChat.tsx`,
`note-report.ts`) imports `ADVICE_DISCLAIMER_SHORT`/`_LONG` /
`FORECAST_DISCLAIMER` / `UPSIDE_PORTFOLIO_DISCLAIMER` from that file, but
the Thesis Pulse panel header
(`"Should you sell, or buy more?"`) had the identical text
(`"Educational, not personalized investment advice. Always your call."`)
typed out as a second, independent string literal. Not a missing
disclaimer — the text was correct and present — but a drift risk exactly
like the ones `disclaimer.ts`'s own comment warns about: the next wording
change would silently miss this one surface.

**Fix:** `src/components/PulsePage.tsx` now imports and renders
`ADVICE_DISCLAIMER_SHORT` from `@/lib/disclaimer` instead of the literal
string. No visible copy change (identical text). Updated the one
`scripts/test-invariants.ts` assertion that pinned the old state (see
below).

### 2. Hardcoded household/alias email tables retain PII indefinitely, untouched by account deletion — backlog

**Where:** `portfell_household_groups` (migration `20260816132758_053...`),
`portfell_account_aliases` (migration `016`), `portfell_seed_claims`
(migration `008`).

**What's wrong:** these three tables are static, migration-seeded
allow-lists keyed by **email address** (Martin's own family: himself,
Amanda, Rasmus, Karoliine, plus his two Google logins) that drive
household circle-mirroring and identity aliasing. None of them have a
foreign key to `portfell_profiles`, so `portfell_purge_user_data()` never
touches them — if one of these five people ever ran self-service account
deletion, their email would still sit in these tables afterward, doing
nothing (the mirroring/alias logic only fires against a live profile row)
but not erased either.

**Why backlog, not fixed:** `AGENTS.md` explicitly guards this exact data
("Do not invent or fix Aasad holdings... this is a guardrail against
hallucinating Martin's own real data") and these are a fixed, five-person
family list the data controller (Martin) maintains about his own
household, not user-submitted PII from the general public — real risk is
close to zero today. Flagging because the pattern (a static, unlinked
email table with no purge path) would become a genuine problem the moment
it's reused for more households or generalized beyond Martin's own
family, which is exactly the direction `AGENTS.md`'s 2026-08-12
product-direction note says the app is heading.

---

## Needs a decision

1. **R2 disaster-recovery cold-copy retention period** (High #1 above).
   Needs: how long is acceptable to keep an encrypted whole-book backup
   after it's created, and whether the mechanism is a Cloudflare bucket
   lifecycle rule (infra config, not code, not settable from this
   sandbox) or an added prune step in the `disaster-recovery` cron. This
   also indirectly decides what Pass 10 should write in the privacy
   policy's retention section (Medium #1).

2. **GDPR Article 8 "digital consent age" for EU users vs. the app's
   global "13 or older" self-attestation.** The sign-in gate
   (`src/components/SignInGate.tsx`) already requires an explicit "I am
   13 or older" checkbox before "Continue with Google" is even
   clickable, applied uniformly including classroom/community invite
   landings — that part is solid, not a gap. But GDPR Article 8 lets EU
   member states set the age at which a minor can consent to an
   "information society service" anywhere from 13 to 16 (several set it
   at 16), which the current single global 13+ gate doesn't account for.
   This app is EU-hosted (Supabase EU region, `src/app/privacy/page.tsx`
   §4) and, per `AGENTS.md`'s 2026-08-12 note, is deliberately moving
   toward "friends, eventually strangers" — i.e., toward being a public,
   EU-facing product, not just Martin's family. Classroom in particular
   is aimed at high-school-age users, who in several EU countries would
   fall in the 13-16 gap depending on where the school is. This is
   exactly the kind of "do we need COPPA/Article-8-style protection"
   judgment call the task brief says not to resolve unilaterally —
   flagging clearly, not fixing. A reasonable next step, if a decision is
   made to address it, is either raising the global gate to 16 (simplest,
   costs some signups) or asking country at sign-up and branching (more
   correct, more product work); either is a product call, not a code fix.

3. **Right-to-access completeness for `portfell_community_invite_uses`**
   (Medium #2) is low-stakes enough that it could plausibly go either way
   — fix now or leave in the ordinary backlog. Listed under Medium above
   rather than here since it's a small, unambiguous addition (one more
   `select` in `collectUserExport`) and not really a judgment call; not
   fixed this pass only because it's Low-impact by design (a join
   timestamp, not new personal data), matching this pass's "be
   conservative" instruction to fix only what's clearly in scope.

---

## Verified clean

- **GDPR erasure cascade.** `portfell_profiles.id references auth.users(id)
  on delete cascade`, and every `portfell_*` table with a user-owned
  foreign key checked this pass (`portfolio_owners`, `lab_state`,
  `communities`/`community_members`/`community_invites`/`community_duels`/
  `community_invite_uses`/`community_join_requests`, `portfolio_invites`,
  `cash_events`, `account_aliases`, `share_links`) is `on delete cascade`
  or `on delete set null` against `portfell_profiles`. On top of the FK
  graph, `portfell_purge_user_data()` (run both from the
  `portfell_delete_my_account()` RPC and from a `before delete` trigger on
  `portfell_profiles`, so it also fires for an admin/dashboard
  `deleteUser`) explicitly: deletes sole-owned portfolios, hands off
  circle-admin roles or deletes now-empty circles, scrubs the deleted
  user's portfolios out of every `portfell_book_snapshots` row regardless
  of `kind` (`nightly`/`pre_delete`/`manual`) via
  `portfell_scrub_snapshot_payload`, and deletes `portfell_error_log` rows
  matching either the user's id or their email (belt-and-suspenders, since
  `error_log.user_id` has no FK). Also confirmed the account-delete route
  itself (`src/app/api/account/delete/route.ts`, Pass 6) revokes sessions,
  best-effort cancels the Stripe subscription, runs the RPC, then deletes
  the `auth.users` row. No orphaned-row bug found anywhere in this graph.
- **In-database snapshot retention is bounded.** `pruneOldSnapshots()` +
  `NIGHTLY_SNAPSHOT_WINDOW = 14` (`src/lib/book-snapshot.ts`) caps nightly
  snapshots at 14 days, separately from pre-delete/manual caps. This is
  the one retention window that *is* already correctly bounded — the gap
  is specifically the R2 cold copies (High #1), which this mechanism
  doesn't touch.
- **GDPR export is comprehensive.** `src/lib/gdpr/user-export.ts`
  (`collectUserExport`) pulls profile, email-notification settings,
  owned portfolios, holdings, cash events, the user's own slice of every
  retained snapshot (via `sliceSnapshotPayload`, scoped to their
  portfolio ids), lab state, community memberships + duels + join
  requests, and portfolio invites for sheets they own (with
  `token_hash`/`token_hint`/`token` stripped). Both
  `/api/account/export` (plaintext JSON, "Export my data" button) and
  `/api/user/export` (default AES-256-GCM envelope, `encrypt=0` for
  plaintext, `format=csv` for a sectioned CSV) delegate to the same
  auth-gated collector, so there's one code path to keep correct. Only
  gap found: Medium #2 above.
- **Right to rectification.** Profile display name
  (`src/components/AccountPage.tsx`, `PATCH` to update it) and every
  holdings/cash field are editable in-app via the normal sheet UI — no
  "contact support to fix a typo" dead end found.
- **Financial-advice framing is systemic, not surface-by-surface.**
  `src/lib/disclaimer.ts` is a genuine single source of truth
  (`ADVICE_DISCLAIMER_SHORT`/`_LONG`, `FORECAST_DISCLAIMER`,
  `UPSIDE_PORTFOLIO_DISCLAIMER`) reused across Margus chat
  (`CcAdvisorChat.tsx`), Forecast (`ForecastPanel.tsx`), the Upside
  Portfolio / Margus Fund page (`UpsidePortfolioPage.tsx`), Thesis Pulse
  (`PulsePage.tsx`, now via the constant after Low #1), and the
  morning/close/Sunday note emails (`note-report.ts`). More importantly,
  the *system prompts themselves* carry the same guardrail independently
  of any UI label: `MARGUS_PERSONA` (`src/lib/ai/margus-persona.ts`) has
  an explicit "Guardrails" section banning trade-order phrasing
  ("do not add", "you should sell", "buy more", etc., "rewrite it and end
  with 'Always your call.'") and framing everything as "an educational
  scenario... never personalized investment, legal, or tax advice, and
  never a guarantee of any outcome." `src/lib/ai/cc-advisor.ts`,
  `src/lib/forecast-conviction.ts`, and `src/lib/forecast-plan.ts` each
  separately restate the same "modeled scenario, not personalized advice,
  never write orders" instruction in their own system prompts, so it's
  enforced at the model-input level in three independent places, not just
  copy-pasted UI text. `scripts/test-invariants.ts`'s existing "Margus
  never writes trade orders to a person" test (unrelated to this pass,
  pre-existing) also passed, corroborating this.
- **Cookie/tracking consent.** `src/components/AnalyticsConsentBanner.tsx`
  + `src/components/ConsentedAnalytics.tsx` already implement a
  deny-by-default gate: Vercel Analytics / Speed Insights render nothing
  (`if (!allowed) return null`) until `saveAnalyticsConsent("allow")` is
  called from an explicit banner, stored in `localStorage`
  (`upside-analytics-consent-v1`), with an equally prominent "No thanks."
  This already correctly distinguishes essential Supabase Auth sign-in
  cookies (always on, not gated, and not analytics) from the optional
  page-view/performance measurement — exactly the EU-facing posture the
  task brief asked to check for. `src/app/privacy/page.tsx` §6 describes
  this accurately. No gap found.
- **Age gate exists and is a real UI control, not just policy text.**
  `src/components/SignInGate.tsx` renders an actual "I am 13 or older"
  checkbox and disables "Continue with Google" until it's checked
  (`disabled={busy || !ageOk}`), applied on every entry point that goes
  through `SignInGate` — including the classroom/community invite landing
  pages (`src/app/account/join/page.tsx`,
  `src/app/communities/join/page.tsx`, both wrapped in `<SignInGate>`).
  The EU Article 8 nuance on top of this is a separate, genuinely open
  question — see "Needs a decision" #2.
- **Data minimization in logs/telemetry.** `sanitizeContext()`
  (`src/lib/telemetry.ts`) bounds any logged context to scalar values,
  64-character keys, capped array (12) and nested-object (12) sizes —
  it can't accidentally serialize a full holdings object or a raw request
  body into a log line. `observeRoute()` (wraps every API route) only
  logs `path`/`method`/`status`/timing/error `message`, never a request
  body. `checkRateLimit()`'s `clientIp()` (`src/lib/rate-limit.ts`) is
  used only as an in-memory `Map` key for abuse throttling — never
  persisted to a database column or a log line. `error-log.ts` does store
  `user_email` and `user_agent` in `portfell_error_log` for genuine
  debugging value, but that table is explicitly covered by
  `portfell_purge_user_data()`'s erasure scrub (both by `user_id` and by
  matching `email`), so it doesn't outlive the account. No plaintext PII
  found in a `console.*` call anywhere in `src/`.
- **Classroom feature's actual data scope.** Per
  `docs/AUTH_AND_COMMUNITIES.md` and the migrations it references, a
  classroom is always `private`, provisions only a paper (fake-money)
  sheet, and real sheets explicitly cannot be shared into one — so there's
  no path for a student's real financial data to enter the classroom
  surface in the first place. This significantly narrows what a
  COPPA/Article-8-style review would even need to worry about; the age
  question above is really about the sign-in gate generally, not about
  classroom leaking anything extra.

---

## Fixes applied this pass

- `src/components/PulsePage.tsx` — Thesis Pulse's advice disclaimer now
  renders `ADVICE_DISCLAIMER_SHORT` from `@/lib/disclaimer` instead of a
  duplicated string literal (Low #1).
- `scripts/test-invariants.ts` — the "Pulse scan sits in its own card, not
  under the lookup bar" test previously asserted
  `page` (PulsePage.tsx's full source) never contains the substring
  `ADVICE_DISCLAIMER` at all; that was only ever true because the file
  used a hand-typed string instead of the constant. Updated the assertion
  to check the constant appears exactly twice (one `import`, one render)
  rather than zero times, preserving the test's real intent — the
  scan-list section below the top panel still can't grow its own
  duplicate copy of the disclaimer — while accommodating the now-correct
  single legitimate usage.

No database migration was written this pass: the one High finding (R2
retention) needs a retention-period decision before any schema or infra
change would even have a shape to take, and the Medium export-completeness
finding is a query addition to `collectUserExport`, not a schema change.

## Checks run

- `npm run typecheck` → clean.
- `npx eslint --max-warnings 0 --ignore-pattern '.claude/**'` → clean.
- `npx tsx scripts/test-invariants.ts` → 2 failures, both pre-existing and
  named in the task brief as unrelated to this pass (`circle awards are a
  grid of cards, not a flat divided list`, `Fund page labels Margus's note
  Thesis`). No new failures — confirmed the updated `ADVICE_DISCLAIMER`
  assertion passes alongside every other test in that same `run()` block.
