# Pass 5 — UX fix log (Round 2)

Companion to `docs/audit/05-ux.md`. One row per finding.
**No row is Resolved without fresh re-verification by the method that
surfaced it.**

| # | Finding | Severity | Status | Evidence |
|---|---|---|---|---|
| H1 | The invariant suite was red — 5 stale rules, guarding nothing | High | **Resolved** | `npm run test:invariants` → **all invariants passed** (was `5 invariant(s) failed`) |
| H2 | The watchlist box fails silently, four ways | High | **Resolved** | Every path now reports; pinned by a new invariant |
| M1 | Options gating contradicted `AGENTS.md` | Medium | **Resolved (decision made)** | `shouldHideOptions` + `AGENTS.md` now agree; 5 tests |

---

## H1 — repairing the guard without weakening it

Two wrong ways to make a red suite green: revert the code until the old
assertion passes, or soften the assertion until anything passes. Four of
these five encode changes Martin explicitly asked for, so the code was
right and the rule needed rewriting to say what is true **now** — with at
least as much force as before.

| Invariant | Was | Now asserts |
|---|---|---|
| power animals | every animal has a unique colour | each theme animal paints from **its theme's own CSS variable, checked against `THEME_COLOR`**, and the eleven others use exactly three distinct temperament grades |
| chrome is quiet | active segment is `bg-background` | active segment is `bg-secondary` + `text-primary`, hover uses the shared `--hover` token, and **an opaque fill can never come back** (`doesNotMatch` on `bg-(background\|muted\|card)`) |
| workspace nav | active room is `bg-primary text-primary-foreground` | `aria-current="page"` still emitted, active room is the quiet raised surface, and it **must not** wear the CTA fill |
| legal pages | a standalone age checkbox | age is asserted **inside the same sentence as Terms and Privacy**, and a standalone age tickbox cannot return |
| fund cron | gate on `xPostingConfigured` | gate is `xPostingEnabled`, **`xPostingConfigured` must not appear** in the route, and `x-post.ts` must require credentials **and** `X_POSTING_ENABLED` |

Several are now **stronger** than what they replaced. The animals one is
the clearest example: it used to assert four hardcoded colour names, and it
now cross-checks the animal table against `THEME_COLOR`, so the two lists
cannot drift apart — the actual property the design promises.

**Verified by breaking it on purpose.** A test that cannot fail is worth
less than no test, so the rewritten animal rule was mutation-tested:

```
$ sed -i 's/beaver: TONE.cat2/beaver: TONE.cat7/' src/lib/portfolio-personality.ts
fail  power animal colours follow theme, then temperament
  AssertionError: beaver should paint from ai_infra's colour (var(--cat-2))
$ git checkout src/lib/portfolio-personality.ts
ok    power animal colours follow theme, then temperament
```

**The real lesson, recorded because it is the reusable part:** the previous
round's fix log noted "2 pre-existing failures" as acceptable background.
That is how a suite dies — once red is normal, the sixth failure looks
exactly like the first five. The suite is at zero now, and it should be
treated as a build break, not a weather report.

## H2 — the watchlist box now says what happened

Four silent `return`s, each given the message it always owed the person:

| Situation | Before | Now |
|---|---|---|
| Name resolves to nothing | nothing | `No company found for "…". Try the ticker symbol.` |
| Search request threw | nothing | `Couldn't look that up just now. Try again in a second.` |
| You already own it | nothing | `You already own NVDA, so it's in your portfolio, not your watchlist.` |
| Already on the watchlist | silently re-added | `NVDA is already on your watchlist.` |

Three details that are the difference between a message and a good one:

- **A failed lookup is distinguishable from "no such company."** Only one of
  the two is worth retrying, and lumping them together tells someone to
  re-type a name that was never the problem.
- **"You already own it" is not phrased as an error**, because it isn't one.
  It names where the ticker actually is.
- **`role="status"`, not `role="alert"`.** It is announced without stealing
  focus from the box the person is still typing in.

The slow path — turning a typed company name into a symbol — now shows a
spinner and disables the submit button, and `add()` refuses re-entry while
one is in flight.

Pinned by a new invariant, `every text box that can fail tells you what
happened`, which checks **both** this component and the onboarding modal, so
the standard and the thing measured against it regress together or not at
all.

## M1 — the options gate, decided

Full reasoning in the report. Short version: `AGENTS.md` said one thing, the
code did the opposite, and **both literal readings were wrong**, because
onboarding is skipped for anyone who already owns something — so "unanswered
hides" would have taken covered calls away from every existing holder at
once. The gate now hides on an explicit `false` only, `AGENTS.md` was
rewritten to match with the reasoning inline, and 5 tests pin it, including
one that ties the `null` case directly to `shouldSkipExperienceOnboarding`.

## Verification

`npm run typecheck` clean · `npm run lint` clean ·
`npm test` **157 tests / 33 files** (149 before) ·
`npm run test:invariants` **all invariants passed** (5 failing before).

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **No live browser.** The watchlist messages, hover states and focus
   behaviour are verified from source and by the invariant suite, not by
   driving a real page.
2. **No real signup**, so the first-60-seconds flow is traced through code.
3. **Touch targets not measured on real hardware.**
