# Upside Lab — 10-Pass Formal Audit: Index

Ten independent passes, each on its own branch off `main`, each reading
`AGENTS.md` first so intentional, documented product decisions weren't
re-flagged as bugs. Severity counts below are each pass's own count at
the time it was written; "Fixed" is what that pass resolved inline
versus left as backlog or a decision for Martin. Passes are listed in
the order they were run; several explicitly build on findings from
earlier passes (noted where relevant).

| # | Pass | Report | Critical | High | Medium | Low | Headline |
|---|---|---|---|---|---|---|---|
| 1 | Visual Cohesion | [01-visual-cohesion.md](01-visual-cohesion.md) | 0 | 0 | 3 | 6 | All Critical items from an earlier run of this pass were already fixed on `main` by the time of the final run (`.glass`/`.glass-well`, brand `--primary`, `--warning` hue) — this pass found only small backlog polish (an off-scale `text-[0.8rem]`, a hand-rolled skeleton, non-glass overlay surfaces by design). |
| 2 | Security | [02-security.md](02-security.md) | 1 (fixed) | 0 | 5 | 4 | Any signed-in user could self-grant an active Stripe subscription via an RLS gap; fixed. `npm audit` clean. Medium/Low items left as backlog. |
| 3 | Performance | [03-performance.md](03-performance.md) | 1 (fixed) | 1 (fixed) | 3 | 2 | Critical + High bundle/query issues fixed; Medium/Low backlog. |
| 4 | Caching | [04-caching.md](04-caching.md) | 2 (fixed) | 0 | 4 | 2 | Two Critical caching bugs (cross-account collision risk on shared-browser `localStorage` keys, stale quote-cache behavior) fixed; Medium/Low backlog. |
| 5 | UX | [05-ux.md](05-ux.md) | 0 | 3 (fixed) | 4 | 3 | Three High-severity first-60-seconds/error-string/accessibility issues fixed, including introducing `plainError()` now reused by later passes; Medium/Low backlog. |
| 6 | Billing | [06-billing.md](06-billing.md) | 0 | 3 (fixed) | 3 | 2 | Confirmed **Upside Lab Pro gates zero product features** (a $12/month support tier) — the central fact later passes (7, 10) build on. Fixed: account deletion never canceled the Stripe subscription (real ongoing financial harm), a webhook out-of-order-delivery race, and raw Stripe error leaks in billing toasts. |
| 7 | Onboarding | [07-onboarding.md](07-onboarding.md) | 0 | 3 (fixed) | 3 | 1 | Three High first-run/invite-redemption dead ends fixed; Medium/Low backlog. |
| 8 | Community | [08-community.md](08-community.md) | 1 (fixed, **needs manual migration apply**) | 2 (fixed) | 2 | 1 | Critical membership/visibility bug fixed in code and migration, but the migration itself still needs manual production apply — flagged prominently in that report, carries forward here. |
| 9 | Compliance | [09-compliance.md](09-compliance.md) | 0 | 1 (needs a decision) | 2 (1 needs a decision, 1 backlog) | 2 (1 fixed) | GDPR erasure/export machinery is unusually thorough and verified clean. The one real gap: R2 disaster-recovery cold copies have no retention policy and are never purged on account deletion — a genuine "needs a decision," handed to Pass 10 for the document-side disclosure. Also flagged the EU Article 8 consent-age question for Pass 10 to cross-check against the sign-in gate (found consistent, not a gap). |
| 10 | Legal | [10-legal.md](10-legal.md) | 0 | 0 | 1 (fixed) | 1 (fixed) | Terms/Privacy were already unusually well maintained: current product name throughout, no removed-feature references, no placeholder text, billing terms matching Pass 6's "Pro gates nothing" finding exactly, both pages properly linked from sign-in and Account. Fixed the one real gap Pass 9 handed off — the Privacy Policy's retention section didn't disclose the R2 cold-copy backup channel at all — by disclosing it accurately without inventing a retention duration that doesn't exist yet. Also added a missing named AI provider (Cerebras) to the third-party list. |

## Open items that need Martin's decision (across all 10 passes)

These are the judgment calls no pass resolved unilaterally, gathered
here since they're the kind of thing a single top-level owner needs to
see in one place rather than hunt through ten reports for:

1. **R2 disaster-recovery cold-copy retention period** (Pass 9 High #1,
   Pass 10 Medium #1). How long should an encrypted whole-book backup
   live in Cloudflare R2 before being purged, and by what mechanism (a
   bucket lifecycle rule, or an added prune step in the
   `disaster-recovery` cron)? Until decided, deleted accounts' data
   persists indefinitely in past cold copies, and the Privacy Policy can
   only disclose that fact, not a duration.
2. **GDPR Article 8 EU-consent-age question** (Pass 9 "needs a decision"
   #2, cross-checked by Pass 10 and found internally consistent as-is).
   Should the app's global "13 or older" sign-in gate be raised (e.g. to
   16) or made country-dependent, given several EU member states set the
   Article 8 digital-consent age above 13 and `AGENTS.md`'s 2026-08-12
   note that the product is moving toward being a public, EU-facing
   product beyond Martin's family?
3. **Community migration from Pass 8 still needs manual production
   apply.** The Critical membership/visibility fix in Pass 8 is written
   (code + migration) but, per that report, has not yet been applied to
   the production database — this is an operational follow-up, not a
   code gap, and belongs at the top of Martin's list regardless of when
   he reads this.
4. **Text scale violation left as a deliberate decision, not guessed
   at** (Pass 1 Medium): `text-[0.8rem]` in `button.tsx`/`toggle.tsx`'s
   `sm` variant should probably become `text-xs` or `text-sm`, visible
   on every small button/toggle app-wide — Pass 1 didn't want to guess
   which one without sign-off.
5. **Optional: a cookie table with individual cookie names/durations**
   (Pass 10, "Needs input from Martin" #3) — the current category-level
   description in the Privacy Policy is accurate and matches verified
   behavior; a more granular table is a possible future addition for
   stricter EU cookie-notice practice, not a documented defect today.

Everything else each pass found was either fixed inline (see each
report's "Fixes applied this pass") or left as ordinary, non-blocking
backlog (see each report's own Medium/Low sections) — this index only
surfaces the items that need an actual decision from Martin, not the
full backlog.
