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
| M1 | Privacy Policy's retention section didn't disclose the R2 cold-copy backup channel | Medium | **Resolved** (prior session) | `src/app/privacy/page.tsx` §7; report §Medium 1 | Fixed when the pass was first run — this was the gap Pass 9 handed over. Disclosed the channel accurately **without** inventing a retention duration, since none had been decided at the time. The duration has since been decided (30 days) and §7 now states it. |
| L1 | Privacy Policy's named AI-provider list was missing Cerebras | Low | **Resolved** (prior session) | `src/app/privacy/page.tsx` §4; report §Low 1 | Fixed when the pass was first run. The "such as" phrasing meant it was never a false claim, but the brief asked specifically whether the list matched `buildProviderChain`, and it was a one-word factual completion. |
| — | R2 disaster-recovery retention period | Needs input | **Resolved** | Decided at 30 days (Pass 9 H1). `privacy/page.tsx` §7 now states 30 in all three places it previously said 90. | The downstream half of Pass 9's decision, closed at the same time. |
| — | GDPR Article 8 EU consent-age question | Needs input | **Resolved** | Decided (Pass 9). Both documents now state both ages, and the legal invariant asserts they match `SignInGate.tsx`. | This pass's original finding — that the UI and the documents agreed with each other — still holds, and is now enforced by a test rather than by hand, which matters more now that there are two numbers to keep in step. |
| — | No cookie table naming individual cookies, purposes and durations | Needs input | **Resolved** (as a decision, plus a real gap it exposed) | `docs/COOKIES.md` records the verified inventory; Privacy §6 rewritten. | Decision: **don't** publish a per-cookie table. A table earns its keep when there are tracking cookies to list, and verifying empirically showed there are none — a clean-profile load set **zero cookies**, before *and* after granting analytics consent, because Vercel Analytics is cookieless. Everything on-device is `localStorage`. That check exposed a genuine gap the original finding missed: §6 was titled "Cookies" and never mentioned on-device storage at all, which ePrivacy Article 5(3) covers equally. §6 now says plainly what is kept on the device and that signing out clears it. One thing flagged rather than asserted in the doc: the Supabase cookie name follows the `@supabase/ssr` convention but couldn't be observed without a reachable Supabase project, so it says to re-verify before publishing externally. |
| — | "We don't train our own models on it" (§3) | Needs input | **Deferred (no change needed)** | — | Currently accurate: this app calls third-party model providers by API and neither runs nor fine-tunes its own. Recorded only because it's the sentence that would need rewriting the day that changes — the same drift risk Pass 9 fixed for the disclaimer constant. Nothing to do today. |

## Deferred summary

One item left, and it is a no-op today: the "we don't train our own
models on it" sentence is currently accurate and is recorded only so it
gets rewritten the day that stops being true.

The other three judgment calls this pass surfaced are now decided and
implemented — the retention duration, the consent age, and the cookie
table (decided *against*, with the storage disclosure it exposed added
instead).

As the report itself notes, the items above are a punch list for a human,
and anything with legal consequence here is worth running past an actual
lawyer rather than treating this pass as advice.
