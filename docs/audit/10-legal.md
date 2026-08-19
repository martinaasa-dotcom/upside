# Pass 10 — Legal Audit

Scope: the Terms of Service and Privacy Policy documents themselves
(`src/app/terms/page.tsx`, `src/app/privacy/page.tsx`) and how they're
wired into the app: internal consistency with what the product actually
does (data collected, third parties used, cookie-consent behavior),
completeness against what a document like this needs, consistency with
the current product name/feature set, billing-terms accuracy against the
Pass 6 findings, and whether the pages are actually linked from anywhere
a person would find them. Distinct from Pass 9 (Compliance), which
covers the underlying GDPR machinery (erasure, export, retention,
age-gate UI) and explicitly handed two items to this pass — see below.
This pass does not draft new legal language, invent company/contact/
jurisdiction facts, or make product policy calls; judgment calls are
listed separately under "Needs input from Martin," not implemented.

Branch: `claude/audit-legal`, based on `origin/main` @ `f9a2566`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 1 | 1 |
| Low | 1 | 1 |

The headline finding of this pass is the same one Pass 9 flagged and
handed off: the Privacy Policy's retention section didn't mention the R2
disaster-recovery cold copies at all, which (per Pass 9) have no stated
retention period anywhere in the codebase. Fixed by disclosing the
backup channel accurately and vaguely (no invented duration, since no
real policy exists yet to state). Everything else checked this pass
came back clean: the two legal pages are unusually well maintained
already, correctly reference the current product name, don't reference
any removed feature, describe the actual third-party processor list
almost completely (one small gap fixed), match the Pass 6 billing
findings exactly, and are reachable from both the sign-in screen and the
Account page.

---

## Medium

### 1. Privacy Policy's retention section didn't disclose the R2 disaster-recovery cold-copy channel — fixed

**Where:** `src/app/privacy/page.tsx` §7 ("Data retention"), §8 ("Your
rights").

**What's wrong:** this is exactly the gap Pass 9 flagged and handed to
this pass (`docs/audit/09-compliance.md`, Medium #1). The nightly
`/api/cron/disaster-recovery` job (`docs/DISASTER_RECOVERY.md`, verified
again this pass: "A daily cron... stored in Cloudflare R2 (or AWS S3)")
encrypts and uploads a full snapshot of every user's cash and holdings
to a permanent, timestamped key with no lifecycle rule, expiry, or
pruning step anywhere in the codebase or in that doc. §7 as written only
described the in-database nightly snapshot ("Nightly snapshots of book
data are kept for backup and recovery... Only the people who run the app
can read a restore") and gave no indication a second, longer-lived,
off-database copy existed at all. §8 separately claimed deleted-account
data is "fully wiped immediately," which, read next to the undisclosed
R2 channel, could be misread as covering a copy it doesn't reach.

**Why this is the right kind of fix for this pass:** per Pass 9, there
is no real retention policy for the R2 channel to state (that's Pass 9's
"needs a decision" item, not resolved yet). Per this pass's severity
model, the correct move for an undisclosed-but-real data flow with no
settled duration is to disclose it accurately and vaguely, not invent a
number. This is a factual disclosure fix (describing something that
already happens), not new legal drafting.

**Fix:**
- `src/app/privacy/page.tsx` §7 now adds: "We also keep a separate,
  encrypted backup copy outside our main database, used only to rebuild
  the app if our database provider had a serious failure. We do not yet
  have a fixed deletion schedule for that backup copy, so it can persist
  longer than the nightly snapshots above, and deleting your account
  does not remove it from that copy."
- §8 now cross-references it: "...your Upside Lab data is still fully
  wiped from active use immediately (see 'Data retention' above for the
  separate backup copy)."
- `LAST_UPDATED` bumped from "18 August 2026" to "19 August 2026" (§11
  "Changes" promises a new date on a material change; this is one).

No duration was invented anywhere in this text. Once Martin decides an
actual R2 retention policy (Pass 9's "needs a decision" #1), this
section should be updated again with the real number — flagged again
below under "Needs input from Martin" for completeness, though the
underlying decision itself is Pass 9's handoff, not new to this pass.

---

## Low

### 1. Privacy Policy's named AI-provider list was missing Cerebras — fixed

**Where:** `src/app/privacy/page.tsx` §4 ("Who sees it: third parties").

**What's wrong:** §4 named the AI model providers as "OpenRouter and
fallbacks such as Groq and Gemini." The actual fallback chain in
`src/lib/ai/model.ts` (`buildProviderChain`, and the `openrouter: ...,
groq: ..., gemini: ..., cerebras: ...` label map) includes a fourth
configured provider, Cerebras, that the sentence didn't name. The
"such as" phrasing meant this wasn't a strictly false claim (an
illustrative, non-exhaustive list), but the task brief asks specifically
whether the Privacy Policy's third-party list matches the real fallback
chain, and this was a one-word, unambiguous factual completion, not a
judgment call.

**Fix:** the list now reads "OpenRouter and fallbacks such as Groq,
Gemini, and Cerebras."

---

## Needs input from Martin

1. **R2 disaster-recovery retention period.** This is Pass 9's "needs a
   decision" #1, restated here because it's the one open item this
   pass's fix is downstream of: how long should an encrypted whole-book
   R2 cold copy live before being purged, and by what mechanism (a
   Cloudflare bucket lifecycle rule, or an added prune step in the
   `disaster-recovery` cron)? Once decided, `src/app/privacy/page.tsx`
   §7 should be updated again to state the actual number, and the R2
   pruning mechanism itself is Pass 9's territory (a compliance/infra
   fix), not this pass's.

2. **GDPR Article 8 EU-consent-age question**, restated from Pass 9's
   "needs a decision" #2: `SignInGate.tsx`'s "I am 13 or older" checkbox
   is internally consistent with what the Terms and Privacy Policy both
   say (both documents say "Under 13 is never allowed... You confirm you
   are 13 or older when you sign in," matching the UI exactly, verified
   this pass, no mismatch found). The open question Pass 9 raised is
   whether a single global 13+ gate is sufficient once several EU member
   states set the Article 8 "digital consent age" as high as 16, given
   `AGENTS.md`'s 2026-08-12 note that the product is moving toward being
   a public, EU-facing product beyond Martin's family. Not a document
   inconsistency (the age the UI enforces and the age the documents state
   agree with each other perfectly today) — a business/legal decision
   about whether that shared age should change, which is not this pass's
   call any more than it was Pass 9's.

3. **No dedicated cookie policy enumerating individual cookies by name,
   purpose, and duration.** §6 of the Privacy Policy describes the
   *categories* correctly and accurately (essential Supabase Auth
   session cookies, Google's own sign-in cookies, opt-in Vercel
   Analytics/Speed Insights) and Pass 9 already verified the underlying
   consent banner behavior matches this description exactly. Some EU
   regulators expect a cookie table with individual cookie names and
   expiry times rather than category-level prose; whether that level of
   detail is worth adding for an app this size is a judgment call, not a
   documented gap in what's already there. Flagging as a possible future
   addition, not a defect in the current text.

4. **Whether "we don't train our own models on it" (Privacy §3) needs
   updating if the AI provider chain ever changes.** Currently accurate
   (this app calls third-party model providers via API, it doesn't run
   or fine-tune its own models) — noting only because this sentence
   would need a rewrite the day that ever changes, same drift risk
   pattern Pass 9 fixed for the disclaimer constant in `PulsePage.tsx`.
   Not an issue today; nothing to fix.

---

## Verified clean

- **Product name and domain.** Both documents use `{PRODUCT_NAME}`
  ("Upside Lab") and there is no reference to any legacy product name
  anywhere in either file (`grep`ed for "portfell"/"Portfell" in both
  pages: no hits). `src/lib/product.ts`'s `PRODUCT_NAME`, `PRODUCT_DOMAIN`
  (`upsidelab.app`), and legal-entity constants are the single source
  both pages import from, so there's exactly one place a rename would
  need to happen.
- **No removed-feature references.** `grep`ed both documents for
  "Arena," "cashflow," "badges," "journal," and "Milestones" (all
  confirmed removed per `AGENTS.md`): no hits in either file. The
  documents only describe features that currently exist (sheets,
  co-ownership, circles/communities, Classroom, Margus/Pulse/Forecast,
  screenshot import, CSV-adjacent "what you enter").
- **No placeholder or unfinished text.** `grep`ed both files for
  "TODO," "FIXME," "XXX," "lorem ipsum," "placeholder," "[INSERT," and
  "TBD" (case-insensitive): no hits. Every section has real prose, a
  real operator name, a real Estonian registry code and VAT ID, and a
  real address — not fabricated by this pass, already present and
  pinned by `scripts/test-invariants.ts`'s "legal pages name the
  operator and match the product" test (`LEGAL_OPERATOR = "Upthink
  Solutions OÜ"`, `LEGAL_REGISTRY_CODE = "16683946"`,
  `LEGAL_VAT_ID = "EE102590654"`, the Aiandi tn address). This test also
  pins that neither document names Martin, Amanda, Rasmus, or Karoliine
  by name, or Martin's personal email, or an em dash character — all
  still true after this pass's edits.
- **Billing terms accuracy matches Pass 6 exactly.** ToS §4 ("Paid
  subscription") describes only the billing mechanics (monthly,
  auto-renewing, Stripe-hosted portal, cancellation keeps access through
  the paid period with no refund, the EU 14-day withdrawal-right
  exception for immediately-delivered digital services, VAT-inclusive
  checkout pricing) and never claims the subscription unlocks any
  feature. This is the correct framing given Pass 6's finding that
  "Upside Lab Pro gates nothing" (a $12/month support tier) — the ToS
  doesn't overclaim, and `UpgradeNudge.tsx`'s own dialog copy ("gets you
  nothing new, literally, not a single feature") is even more explicit
  about it than the ToS needs to be. The cancellation policy stated in
  the ToS (no refund on the partial period) matches exactly what Pass
  6's fix implemented in `src/app/api/account/delete/route.ts`
  (`stripe.subscriptions.cancel()`, immediate, no proration) — no
  drift between what the document promises and what the code does.
- **Cookie-consent description matches Pass 9's verified behavior.**
  Privacy §6 says essential Supabase Auth cookies are always on and
  Vercel Analytics/Speed Insights are opt-in only, changeable from
  Account. Pass 9 independently verified `AnalyticsConsentBanner.tsx` /
  `ConsentedAnalytics.tsx` implement exactly this (deny-by-default,
  `if (!allowed) return null` until explicit consent). No new check
  needed this pass beyond confirming the document text still matches
  Pass 9's finding; it does.
- **Age-gate UI matches the documents.** `SignInGate.tsx` renders "I am
  13 or older" as a real checkbox gating the sign-in button
  (`disabled={busy || !ageOk}`); both documents say the same age in the
  same words ("Under 13 is never allowed... You confirm you are 13 or
  older when you sign in"). No mismatch. The deeper Article 8 question
  is a decision, not a document bug (see "Needs input from Martin" #2).
- **Third-party processor list is otherwise complete.** Checked every
  processor named in Privacy §4 against actual code: Supabase (DB/auth,
  EU-hosted, `src/lib/supabase/`), Resend (`src/lib/email/` — sends
  weekday notes, invites, feedback), AI providers (`src/lib/ai/model.ts`
  — fixed the missing Cerebras above), market data providers
  (`src/lib/market/quotes.ts` — Yahoo primary, Twelve Data and Finnhub
  fallbacks, correctly described generically as "fallback quote
  providers" without over-committing to naming all of them, which is
  fine since the sentence doesn't claim to be exhaustive there), Vercel
  (hosting + the same analytics already covered in §6), and Stripe
  (billing, correctly scoped: "we never see or store your card number,"
  matching Pass 6's confirmed key/secret hygiene finding that Stripe
  keys and card data never touch this app's own code paths).
- **Data subject rights / GDPR references are present and match Pass 9's
  verified erasure/export machinery.** §8 names access, rectification,
  erasure, portability, and objection, and points at the real in-app
  export/delete tools Pass 9 confirmed are comprehensive and correctly
  cascading (`collectUserExport`, `portfell_purge_user_data()`). No
  "contact support to exercise your rights" dead end — the tools are
  self-service, and the document says so.
- **Children's-data / Classroom language is present in both documents**
  and consistent with `docs/AUTH_AND_COMMUNITIES.md`'s actual Classroom
  scope (private only, paper/fake-money sheets only, real sheets cannot
  be shared into a class) — Pass 9 already verified this narrows the
  actual risk surface; the documents describe that scope accurately in
  both ToS §5 and Privacy §10, and don't overstate or understate what
  Classroom can access.
- **Contact/operator information is present and reachable.** Both pages
  name `LEGAL_OPERATOR`, `LEGAL_ADDRESS`, `LEGAL_REGISTRY_CODE`,
  `LEGAL_VAT_ID`, `PRODUCT_CONTACT_EMAIL` (`privacy@upthink.ee`), and
  `PRODUCT_SUPPORT_EMAIL` (`app.support@upthink.ee`) as real `mailto:`
  links, not placeholder addresses.
- **Legal pages are linked, not orphaned.** `/terms` and `/privacy` are
  linked from `SignInGate.tsx` (the "By continuing you agree to the
  Terms and Privacy policy" line under the Google sign-in button, the
  only entry point to the app when Supabase auth is configured) and from
  `AccountPage.tsx` (a "Privacy policy · Terms of service" line in the
  account page's data-controls area). The two documents also link to
  each other. There is no separate marketing site in this repo
  (`src/app/page.tsx` is the app itself, wrapped in `SignInGate`) for
  this pass to check a footer on beyond those two real surfaces — both
  confirmed wired.
- **No market slang in either document.** `grep`ed both files for the
  `AGENTS.md` banned-word list (sleeve, marks, tape, conviction,
  digestion, dry powder, beta, risk-on, drawdown, rotation): no hits.
  Both documents already use plain language throughout ("the names you
  hold," "today's prices," "the sheets you linked").

---

## Fixes applied this pass

- `src/app/privacy/page.tsx` §7 — disclosed the R2 disaster-recovery
  cold-copy backup channel and its lack of a fixed retention period,
  without inventing a duration (Medium #1, Pass 9's handoff).
- `src/app/privacy/page.tsx` §8 — cross-referenced the same backup
  caveat next to the "fully wiped immediately" deletion claim so the two
  sections don't read as contradictory (part of Medium #1).
- `src/app/privacy/page.tsx` §4 — added the missing "Cerebras" to the
  named AI-provider fallback list (Low #1).
- `src/app/privacy/page.tsx` `LAST_UPDATED` — bumped "18 August 2026" to
  "19 August 2026" per §11's own promise to reflect material changes
  with a new date.

No changes were made to `src/app/terms/page.tsx` — every check against
it (product name, removed features, billing accuracy, age gate,
placeholder text, linking) came back clean.

No `scripts/test-invariants.ts` assertions needed updating: the existing
"legal pages name the operator and match the product" test only pins
substring presence of shared constants and a handful of exact phrases
(none of which this pass's edits touched or removed), plus the
no-em-dash / no-personal-name checks, all of which still pass against
the edited file.

## Checks run

- `npm run typecheck` → clean.
- `npx eslint --max-warnings 0 --ignore-pattern '.claude/**'` → clean.
- `npx tsx scripts/test-invariants.ts` → 2 failures, both pre-existing
  and named in the task brief as unrelated to this pass ("circle awards
  are a grid of cards, not a flat divided list," "Fund page labels
  Margus's note Thesis"). No new failures — "legal pages name the
  operator and match the product" passes.
