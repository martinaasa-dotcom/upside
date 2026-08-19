# Upside Lab — 10-Pass Formal Audit: Index

Ten independent passes, each on its own branch off `main`, each reading
`AGENTS.md` first so intentional, documented product decisions weren't
re-flagged as bugs. Severity counts below are each pass's own count at
the time it was written; "Fixed" is what that pass resolved inline
versus left as backlog or a decision for Martin. Passes are listed in
the order they were run; several explicitly build on findings from
earlier passes (noted where relevant).

**Every pass now has a fix log** (`<NN>-<pass-name>-fix-log.md`), one row
per finding, with a Resolved / Deferred / Stuck status and
re-verification evidence attached to anything marked Resolved. The
original run of each pass fixed its Critical and High findings and left
Medium and Low as backlog; a follow-up pass then worked those backlogs,
closing what was cheap and unambiguous and recording an explicit reason
for everything else. Nothing is silently dropped — if an item isn't
fixed, its row says why, and the judgment calls are gathered below.

**No Critical or High findings are open across any pass.** What remains
is Medium and Low, and most of it is deliberately deferred: product,
design, or legal decisions that belong to Martin, plus a small number of
items whose only real fix is infrastructure the project doesn't have yet
(a shared rate-limit store) or another database migration on a queue that
already has one unapplied.

| # | Pass | Report | Critical | High | Medium | Low | Headline |
|---|---|---|---|---|---|---|---|
| 1 | Visual Cohesion | [report](01-visual-cohesion.md) · [fix log](01-visual-cohesion-fix-log.md) | 0 | 0 | 3 | 6 | All Critical items from an earlier run of this pass were already fixed on `main` by the time of the final run (`.glass`/`.glass-well`, brand `--primary`, `--warning` hue) — this pass found only small backlog polish (an off-scale `text-[0.8rem]`, a hand-rolled skeleton, non-glass overlay surfaces by design). |
| 2 | Security | [report](02-security.md) · [fix log](02-security-fix-log.md) | 1 (fixed) | 0 | 5 | 4 | Any signed-in user could self-grant an active Stripe subscription via an RLS gap; fixed. `npm audit` clean. Medium/Low items left as backlog. |
| 3 | Performance | [report](03-performance.md) · [fix log](03-performance-fix-log.md) | 1 (fixed) | 1 (fixed) | 3 | 2 | Critical + High bundle/query issues fixed; Medium/Low backlog. |
| 4 | Caching | [report](04-caching.md) · [fix log](04-caching-fix-log.md) | 2 (fixed) | 0 | 4 | 2 | Two Critical caching bugs (cross-account collision risk on shared-browser `localStorage` keys, stale quote-cache behavior) fixed; Medium/Low backlog. |
| 5 | UX | [report](05-ux.md) · [fix log](05-ux-fix-log.md) | 0 | 3 (fixed) | 4 | 3 | Three High-severity first-60-seconds/error-string/accessibility issues fixed, including introducing `plainError()` now reused by later passes; Medium/Low backlog. |
| 6 | Billing | [report](06-billing.md) · [fix log](06-billing-fix-log.md) | 0 | 3 (fixed) | 3 | 2 | Confirmed **Upside Lab Pro gates zero product features** (a $12/month support tier) — the central fact later passes (7, 10) build on. Fixed: account deletion never canceled the Stripe subscription (real ongoing financial harm), a webhook out-of-order-delivery race, and raw Stripe error leaks in billing toasts. |
| 7 | Onboarding | [report](07-onboarding.md) · [fix log](07-onboarding-fix-log.md) | 0 | 3 (fixed) | 3 | 1 | Three High first-run/invite-redemption dead ends fixed; Medium/Low backlog. |
| 8 | Community | [report](08-community.md) · [fix log](08-community-fix-log.md) | 1 (fixed, **needs manual migration apply**) | 2 (fixed) | 2 | 1 | Critical membership/visibility bug fixed in code and migration, but the migration itself still needs manual production apply — flagged prominently in that report, carries forward here. |
| 9 | Compliance | [report](09-compliance.md) · [fix log](09-compliance-fix-log.md) | 0 | 1 (needs a decision) | 2 (1 needs a decision, 1 backlog) | 2 (1 fixed) | GDPR erasure/export machinery is unusually thorough and verified clean. The one real gap: R2 disaster-recovery cold copies have no retention policy and are never purged on account deletion — a genuine "needs a decision," handed to Pass 10 for the document-side disclosure. Also flagged the EU Article 8 consent-age question for Pass 10 to cross-check against the sign-in gate (found consistent, not a gap). |
| 10 | Legal | [report](10-legal.md) · [fix log](10-legal-fix-log.md) | 0 | 0 | 1 (fixed) | 1 (fixed) | Terms/Privacy were already unusually well maintained: current product name throughout, no removed-feature references, no placeholder text, billing terms matching Pass 6's "Pro gates nothing" finding exactly, both pages properly linked from sign-in and Account. Fixed the one real gap Pass 9 handed off — the Privacy Policy's retention section didn't disclose the R2 cold-copy backup channel at all — by disclosing it accurately without inventing a retention duration that doesn't exist yet. Also added a missing named AI provider (Cerebras) to the third-party list. |

## What the follow-up fix phase closed

The headline column above describes each pass as originally written, when
Medium and Low were left as backlog. Those backlogs have since been
worked. Closed in the follow-up, with evidence in each pass's fix log:

- **Pass 2** — CSV export made formula-injection-safe (guard applies to
  text only, so negative amounts still round-trip); `?force=1` on the
  seasonality route now requires a signed-in caller; `parseJsonBody` caps
  bodies at 1 MB with a 413; the dev-only demo lock refuses on any
  deployed environment; GDPR export gained a durable per-user rate limit.
- **Pass 3** — classroom starting-cash writes go out concurrently instead
  of one sequential round trip per student; Lab's three sub-tabs are now
  separate chunks.
- **Pass 4** — Thesis Pulse no longer feeds one holder's position size and
  lifetime return into a prompt whose answer is cached under a key shared
  with other holders; the self-contradictory `Cache-Control` is gone;
  concurrent quote requests for the same ticker share one upstream call.
- **Pass 5** — the four icon-only admin buttons have real screen-reader
  names, with the two Refresh buttons named distinctly.
- **Pass 6** — Stripe customer creation is idempotent on the user id; the
  "already subscribed?" check queries exactly the blocking statuses from
  a now-shared constant; a dead doc reference removed.
- **Pass 7** — the experience-tier gate can no longer silently downgrade a
  returning reader when a fetch fails; a docstring that promised a
  placeholder price the code never applied now describes reality.
- **Pass 9** — `portfell_community_invite_uses` is in the GDPR export, in
  both the JSON and CSV serialisations.

Passes 1, 8 and 10 had nothing left to close in code: what remains in
each is a design, product, or legal decision, or database hardening that
would add to the unapplied-migration queue.

## Migrations — all applied and verified

Nothing is outstanding. All three were applied to production on
2026-08-19 and verified rather than assumed:

1. ~~**`20260819120000_classroom_real_book_share_rls.sql`** (Pass 8's
   Critical)~~ — **applied and verified.** Policy read back from
   `pg_policy` matches the migration clause for clause. Verifying it
   surfaced a new Medium (N1 in the Pass 8 fix log), fixed by migration 3
   below.
1b. ~~**`20260819150000_classroom_admin_share_rls.sql`** (N1)~~ —
   **applied and verified.** A single rolled-back fixture test covering
   both roles returned:

   ```
   student: real blocked = yes  |  paper allowed = yes
   teacher: real blocked = yes  |  paper allowed = yes
   ```

   All four branches. "Never share a real book into a class" now holds
   against students *and* class admins, and the positive half confirms
   neither policy is over-tight — a policy that rejected everything would
   look secure while breaking every classroom.
2. ~~**`20260819140000_lab_watchlist.sql`**~~ — **applied and verified
   2026-08-19** (`information_schema` shows `watchlist jsonb` defaulting to
   `'[]'::jsonb`). Adds the `watchlist` column to
   `portfell_lab_state` so the Sunday letter can suggest names the reader
   is watching. `/api/lab` tolerates its absence (it drops the column and
   retries once, per warm instance), so deploy order does not matter and
   conviction notes keep syncing either way. Until it is applied the
   watchlist simply doesn't persist, and that section of the letter is
   empty.

## All five open decisions are now made

The five judgment calls the passes deliberately did not resolve
unilaterally have all been decided and implemented:

1. **R2 cold-copy retention** — **30 days**, down from 90. These copies
   exist to rebuild after catastrophic loss, a mass delete, or ransomware,
   all noticed in days; 90 read as an archive and raised the GDPR bar for
   no operational gain. The cron prune stays the primary mechanism, with a
   45-day R2 bucket lifecycle rule as a backstop because the prune runs
   *inside* the cron — if the cron stops, objects live forever with nothing
   to notice, and that gap was the real risk rather than the number.
   `DISASTER_RECOVERY.md` also now makes re-running
   `portfell_purge_user_data()` a required restore step, which is what
   makes "backups retain data until the cycle expires" defensible rather
   than an excuse. Per-user purging of existing copies was deliberately
   **not** attempted: they are whole-book encrypted blobs, so surgical
   erasure means decrypting, filtering and re-encrypting every backup to
   satisfy one deletion.
2. **GDPR Article 8 consent age** — **split by how the account is
   created**: 13 for a classroom invite (school context, pretend money, no
   payment, a teacher in between — a flat 16 would lock out the
   high-school product Classroom was built for), 16 for everything else
   (self-serve signup with real portfolio data and a paid tier; 16 is the
   strictest member-state threshold, so the per-country analysis goes
   away). Country-dependent gating was rejected — it needs reliable
   geolocation to enforce an age nobody can verify. **Still worth a
   lawyer's sign-off:** minors plus financial content.
3. **Pass 8's community migration** — **applied and verified**, along with
   two more. See the migrations section above.
4. **`text-[0.8rem]` type-scale violation** — **`text-sm`**. Rounded up
   because `text-xs` is the app's stated font *floor*, not a default, and
   `sm` buttons carry real labels; the `xs` variant already covers the
   genuinely tiny case. This was the last arbitrary text size in the app
   outside the documented `UpsideLogo` exception.
5. **A per-cookie table** — **decided against**, because verifying showed
   there is nothing to tabulate: a clean-profile load sets **zero
   cookies**, before and after granting analytics consent, since Vercel
   Analytics is cookieless. The check exposed a real gap the finding
   missed, though — Privacy §6 was titled "Cookies" and never mentioned
   on-device storage, which ePrivacy Article 5(3) covers equally. §6 now
   states what is kept on the device and that signing out clears it, and
   `docs/COOKIES.md` holds the verified inventory for the day a
   non-cookieless third party makes a public table worth publishing.

## What is still open

Nothing Critical or High, and nothing blocking. This section is kept
current rather than left as a historical snapshot — every fix log linked
below has the day-by-day detail; this is only the rollup. As of
2026-08-19:

- **No open human actions.** The two migrations written for Pass 8
  M2/L1 and Pass 9 L2
  (`20260819160000_community_last_admin_and_classroom_unpin.sql`,
  `20260819170000_purge_email_seed_tables_on_deletion.sql`) have been
  applied to production by Martin, same as the earlier Cloudflare R2
  setup and the first live Stripe payment
  (`docs/DISASTER_RECOVERY.md`, `docs/STRIPE_BILLING.md`). None of this
  is independently re-verified from this session — no reachable
  production Supabase project — so it's recorded as Martin's word,
  not fresh evidence.
- **Product decisions that were made**, not left open: classmates no
  longer see each other's cost basis in a Classroom, only the teacher and
  their own sheet (Pass 8 M1); a missing buy price still gets skipped
  rather than defaulted to $0.01, with the skip message now naming the
  fix (Pass 7 M2); generic invite copy says "a group" where the kind is
  unknown and "Circle" or "class" where it is (Pass 7 M3, L1); open
  invite links now default to a 30-day expiry instead of never expiring
  (Pass 2 M5); icon-sm/icon-xs buttons now get a 44px hit area on any
  touch device without growing on desktop (Pass 5 M1).
- **Infrastructure the project doesn't have**: the CSP `unsafe-inline`
  widening still needs Next.js to ship noncing for cached Flight payloads
  (Pass 2 M2) — nothing to do until that ships. Distributed rate limiting
  turned out not to need new infrastructure at all: `takeDurableRateLimit`
  was already Postgres-backed and already in the codebase, so the four
  endpoints that genuinely needed it (feedback, telemetry, log-error, the
  invite peek) now use it (Pass 2 M1). A billing reconciliation cron was
  built the same way once Pro started taking real payments (Pass 6 M1).
- **Deliberately not "cleaned up"**: the `plainError` identity entries
  (Pass 5 L3) are load-bearing — they short-circuit before
  `looksTechnical()`, guaranteeing those sentences reach the user. The
  household/alias/seed-claim tables (Pass 9 L2) stay data `AGENTS.md`
  guards — nothing about their **content** changed — but they are no
  longer an erasure gap: account deletion now sweeps a matching email out
  of all three the same way it already scrubbed the error log.
- **One design question**: whether overlay chrome (Dialog, Sheet,
  Popover, Select, Command) should become glass now that top-level cards
  are (Pass 1). They are deliberately opaque and self-consistent today,
  and blur behind small menu text risks legibility.
- **Not needed**: a published per-cookie table. The Supabase session
  cookie name in `docs/COOKIES.md` is derived from the `@supabase/ssr`
  naming convention rather than independently observed, but that only
  matters if a per-cookie table is ever published externally — Martin has
  said that isn't happening, and the Privacy Policy stays at category
  level, which is what regulators expect for an app this size.
