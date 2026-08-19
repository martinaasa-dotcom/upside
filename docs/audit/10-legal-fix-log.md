# Pass 10 — Legal: fix log

One row per finding in [`10-legal.md`](10-legal.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

This pass found no Critical or High items. Its own summary is worth
keeping in view: the Terms and Privacy Policy were already unusually well
maintained — current product name throughout, no references to removed
features, no placeholder text, billing terms matching Pass 6's "Pro gates
nothing" finding exactly, and both pages properly linked from the sign-in
screen and Account.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| M1 | Privacy Policy's retention section didn't disclose the R2 cold-copy backup channel | Medium | **Resolved** (prior session) | `src/app/privacy/page.tsx` §7; report §Medium 1 | Fixed when the pass was first run — this was the gap Pass 9 handed over. Disclosed the channel accurately **without** inventing a retention duration, since no duration had been decided. That remains the right shape until Pass 9's H1 decision is made. |
| L1 | Privacy Policy's named AI-provider list was missing Cerebras | Low | **Resolved** (prior session) | `src/app/privacy/page.tsx` §4; report §Low 1 | Fixed when the pass was first run. The "such as" phrasing meant it was never a false claim, but the brief asked specifically whether the list matched `buildProviderChain`, and it was a one-word factual completion. |
| — | R2 disaster-recovery retention period | Needs input | **Deferred — needs Martin's decision** | — | Restated here because M1's wording is downstream of it: once a duration exists, `privacy/page.tsx` §7 should state the number. The pruning mechanism itself is Pass 9's territory (see that fix log's H1). Item #1 in `00-summary.md`'s decision list. |
| — | GDPR Article 8 EU consent-age question | Needs input | **Deferred — needs Martin's decision** | — | Verified this pass and found **no document inconsistency**: `SignInGate.tsx`'s "I am 13 or older" checkbox, the Terms, and the Privacy Policy all state the same age. The open question is whether that shared age should change given several EU member states set the Article 8 digital-consent age as high as 16. A business/legal decision, not a drafting error. Item #2 in `00-summary.md`'s decision list. |
| — | No cookie table naming individual cookies, purposes and durations | Needs input | **Deferred — needs Martin's decision** | — | §6 describes the categories correctly and Pass 9 verified the consent banner behaves as described. Some EU regulators expect per-cookie detail rather than category-level prose; whether that's worth adding for an app this size is a judgment call, not a documented gap. Item #5 in `00-summary.md`'s decision list. |
| — | "We don't train our own models on it" (§3) | Needs input | **Deferred (no change needed)** | — | Currently accurate: this app calls third-party model providers by API and neither runs nor fine-tunes its own. Recorded only because it's the sentence that would need rewriting the day that changes — the same drift risk Pass 9 fixed for the disclaimer constant. Nothing to do today. |

## Deferred summary

Four items left unfixed, none silently, and none of them is a defect in
the current text. All four are the "genuine legal judgment call" bucket
this pass was explicitly asked to produce rather than pretend to resolve
— three already sit in `00-summary.md`'s decision list, and the fourth
is a no-op today recorded for the day it isn't.

As the report itself notes, the items above are a punch list for a human,
and anything with legal consequence here is worth running past an actual
lawyer rather than treating this pass as advice.
