# Pass 7 — Onboarding: fix log

One row per finding in [`07-onboarding.md`](07-onboarding.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file, `npm run test`
111/111, `npm run test:invariants` at its 2 pre-existing failures.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| H1 | The Supabase-hosted OAuth callback silently dropped sign-in failures | High | **Resolved** (prior session) | Report §High 1 | Fixed when the pass was first run, merged to `main`. |
| H2 | Sheet co-owner invite landing hid its retry form once a URL had a code, making a failed invite a dead end | High | **Resolved** (prior session) | Report §High 2 | Fixed when the pass was first run. |
| H3 | Circle/classroom invite landing had no recovery UI at all on failure | High | **Resolved** (prior session) | Report §High 3 | Fixed when the pass was first run. |
| M1 | `ExperienceOnboardingGate` could silently overwrite a returning user's real tier with "investor" | Medium | **Resolved** | `src/components/ExperienceOnboardingGate.tsx:123-145` — the `saveStoredTier("investor")` + POST are now inside `if (!stored)`, so the inference only runs for someone who genuinely has no tier on this device. | The report declined to touch this ("not fixed here per the brief's instruction not to fix the disabled gate speculatively") but also named the exact fix and warned it becomes a real bug the moment the wizard or the hidden-tab maps are re-enabled. It's a two-line guard with no behavioural effect while the gate is disabled, so closing it now is strictly safer than leaving a latent silent-downgrade in code someone will switch on later. Deliberately did **not** add a heal-the-server push of the stored value: writing this browser's cached tier back to whatever account is signed in is the same shared-device hazard Pass 4's Critical #2 was about. |
| M2 | `parseHoldingsPaste`'s docstring described a placeholder-price feature the code doesn't have | Medium | **Resolved** (documentation half) | `src/lib/csv-import.ts:203-214`. Confirmed the behaviour first at `csv-import.ts:241-248`: a line without a valid buy price is skipped with "Need a buy price after the share count" — no placeholder is ever substituted. The comment now says that, and names the missing fast path as an open product decision. | The report offered "either implement the placeholder or correct the comment" and called the behaviour change a real product call. Corrected the comment, which was actively misleading; left the behaviour alone. Whether pasting `NBIS 500` with no cost should land at $0.01 rather than be skipped is Martin's call — it changes what ends up in someone's book. **Decided since:** keep skipping, and make the message do the work. A $0.01 basis reads as a +1,000,000% gain, which then feeds the Sunday letter's add/trim suggestions, the position-size arithmetic and Pulse — a wrong number that spreads is worse than a skipped line. All three skip reasons now name the fix and show the shape (`"Need the price you paid per share, after the share count. Like: NBIS 500 85.10"`), and the docstring records the reasoning rather than leaving it open. |
| M3 | Invite copy says "community" where the rest of the product says "Circle" | Medium | **Deferred** | — | Not a safe find-and-replace. The generic fallback covers **both** circles and classrooms (`src/lib/invite-landing.ts:38`, `src/lib/email-letter.ts:156`, `src/app/api/communities/[id]/invites/route.ts:102` are all the unnamed case), and calling a school classroom invite "a Circle" would be wrong rather than more consistent. Getting this right means picking per-kind wording, which is a copy decision for Martin, not a mechanical rename. |
| L1 | Generic invite copy differs slightly between the in-app landing and the email | Low | **Deferred** | — | Same root as M3 and the report's own note says the two are never shown to the same person side by side. Worth a single source of truth if this copy ever needs a legal or tone pass; not a defect to patch ahead of the M3 wording decision. |

## Deferred summary

Three items left unfixed, none silently: **M2**'s behavioural half, plus
**M3** and **L1**, are all product/copy decisions for Martin. M3 and L1
in particular should be decided together, since they're the same sentence
in two places.
