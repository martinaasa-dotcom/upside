# Pass 1 — Visual Cohesion fix log (Round 2)

Companion to `docs/audit/01-visual-cohesion.md`. One row per punch-list item.
**No row is marked Resolved without fresh re-verification evidence gathered
*after* the fix, using the same method that surfaced the finding.** Rows that
could not be verified in this sandbox stay Unable to Verify — they are not
upgraded because the code change looks right.

Final captures: `audit-final/`. Phase 1 captures: `audit-current/`.

| # | Item | Round/§ | Platforms | Status | Attempts | Evidence | Notes |
|---|---|---|---|---|---|---|---|
| 1 | Glass blur dead in Blink | R2-7 / C1 | Desktop, Android | **Resolved** | 1 | Compiled bundle now emits `-webkit-backdrop-filter` **and** `backdrop-filter` (`.glass` and `.glass-well`); computed `backdrop-filter: blur(28px) saturate(1.6)` on both desktop and Android, was `none`. Mechanism proof: `audit-current/probe-backdrop.png` | Cause was source order — the standard property was authored first and the CSS transform collapsed the pair to the prefixed one only. Prefixed first, standard last. |
| 1i | same | R2-7 | **iOS** | **Unable to Verify (WebKit Unavailable)** | — | `npx playwright install webkit` fails in this sandbox | Needs a real WebKit engine or device. WebKit honours the prefixed form, so iOS was likely the only platform where this ever worked. |
| 2 | Gray-to-gray card gradient | R2-8 | Desktop, Android | **Resolved** | 1 | `gradientBgs` is `[]` on every signed-in page both before and after — there was never a card gradient. The vertical ramp on the Movers panel was the ambient glow through an unblurred film; it now blurs | Diagnosed as a symptom of C1, not a separate defect. Closed by item 1. |
| 2i | same | R2-8 | **iOS** | **Unable to Verify (WebKit Unavailable)** | — | as above | |
| 3 | Ambient glow clipped at the header | R2-13 / C2 | Desktop, Android | **Resolved** | 1 | Vertical pixel scan at x=30, re-run on all three targets: chrome band was `rgb(0,0,0)` at cssY 94 stepping to `rgb(45,40,25)` at 98; now reads `rgb(11,10,6)` through the band — the glow carries through instead of terminating | `AppHeader.tsx:122` and `MobileTopBar.tsx:74` were opaque `bg-background`; both now `bg-background/75 backdrop-blur-xl`, matching the desktop header. Mobile gains translucent chrome for the first time. |
| 3i | same | R2-13 | **iOS** | **Unable to Verify (WebKit Unavailable)** | — | Chromium-emulated scan matches Android, but `backdrop-blur` fidelity is the WebKit question | |
| 4 | Unexplained green glow | R2-14 | Desktop, iOS, Android | **Resolved** | 2 | Sampled the same four points: `(1330,560)` was `rgb(1,15,9)` (G-dominant), now `rgb(13,11,7)`; `(1380,620)` was `rgb(0,9,5)`, now `rgb(9,8,5)`. Every point is R>G>B, matching the warm top-left reference `rgb(37,34,21)` | Attempt 1 removed the `to-gain/10` stop from the card halo — measured *still green*. Attempt 2 found the real source: a second hand-rolled ambient lobe, `bg-gain/10 blur-[130px]` at `SignInGate.tsx:138`. Not a WebKit-sensitive property, so iOS is verified here. |
| 5 | Purple/violet/fuchsia/indigo still shipped | R1-3 / C3 | Desktop, iOS, Android | **Partially Resolved** | 1 | `THEME_COLOR` now references `var(--cat-*)`; the only remaining hex in the file is inside the comment naming what was removed. Rendered legend re-measured: teal `rgb(72,183,189)`, slate-blue `rgb(115,169,225)`, sky `rgb(86,178,212)`, gold `rgb(189,162,87)`, coral `rgb(208,151,95)`, neutral `rgb(125,125,125)` — no violet/fuchsia/indigo/cyan. `audit-final/lab-desktop.png` | **`ANIMAL_CARD_TONE` is deliberately left open — see the Deferred section below.** |
| 6 | Hero headline gradient text | R1-1 / F-High-1 | Desktop, iOS, Android | **Resolved** | 1 | `gradientText` count on the sign-in page was `1`, now `0`; `[]` app-wide | Solid `--foreground`. Measured contrast before the change was 19.26:1 → 14.73:1, i.e. never a legibility failure — recorded honestly in the report rather than overstated. |
| 7 | Sign-in halo overdone | R2-17 / F-High-3 | Desktop, iOS, Android | **Resolved** | 1 | Same computed-style dump: `blur(64px)` at 395×666px / `opacity-90` → `blur(40px)` at 347×617px / `opacity-70`, and the gradient no longer terminates in `--gain` | Now in line with the signed-in baseline, whose loudest effect is `0 12px 32px -16px`. |
| 8 | Mobile touch targets under 44pt/48dp | F-High-2 | iOS, Android | **Resolved** | 3 | Re-ran the same measurement on Pixel 7 and iPhone 14 Pro: **8 → 0** real offenders. Only `Skip to content` (1×1, `sr-only`, keyboard-only, expands on focus) remains and is correctly excluded. `audit-final/touch-android.json` | Attempt 1: extended the `[data-slot="button"]` rule from icon-only to every size (8→3). Attempt 2: `touch-target` on the hand-rolled cash control, `PortfolioTable.tsx:460` (3→2). Attempt 3: `touch-target` on the brand link, `HeaderBrand.tsx:29` (2→1). Layout re-checked on both targets — nothing shifted, and no desktop pixel moves (the rule is pointer-gated). |
| 9 | `DESIGN_TOKENS.md` stale | F-High-4 | — | **Resolved** | 1 | All five claims corrected against measured values, plus a new "Categorical data ramp" section and a `--loss` chroma note | The doc had drifted far enough to be actively misleading — it described `.glass` at the wrong alpha and blur, claimed `.glass-well` had no blur, described an ambient glow that no longer exists, and asserted `ANIMAL_CARD_TONE` was dead code. |
| 10 | `--loss` out of sRGB gamut | F-Med-1 | Desktop, iOS, Android | **Resolved** | 1 | Movers accent bars re-sampled: loss bar was `rgb(255,32,86)` (two channels pinned), now `rgb(242,67,95)`; gain bar unchanged at `rgb(0,188,125)`. Candidate values rasterised to canvas to confirm in-gamut before choosing | `--chart-5` shared the value and moved with it. |
| 11 | Concentration figures using `--loss` | F-Med-2 | Desktop, iOS, Android | **Resolved** | 1 | `LabSheet.tsx` — both `valueClassName` branches now `text-warning`; `grep -c "text-warning"` → 2 | "Largest position" and "Top N combined" are cautions, not losses. |
| 12 | Toasts collide with the mobile tab bar | **New (F-New-1)** | iOS, Android | **Resolved** | 1 | Re-ran the bottom-band overlap probe on a Pixel 7: previously two `cn-toast` elements at y=770/757 over a nav starting at y=774; now the nav is the only element in that band | Found during Phase 2 re-verification, not in the Phase 1 report. Sonner swaps to `mobileOffset` below its 600px breakpoint and ignores `offset` entirely, so the dock-aware offset never applied on a phone and it fell back to sonner's own 16px. Both props now carry the `--dock-pad` expression. |
| 13 | Movers ragged final row | F-Med-3 | all | **Deferred** | 0 | — | Cosmetic, and the honest fix is a product call about how many movers to show (4 vs 6 vs fill), not a style change. Flagged for Martin. |
| 14 | Mobile Movers loses the comparison | F-Med-4 | iOS, Android | **Deferred** | 0 | — | Suggested fix (horizontal snap rail, S10) is a layout redesign, not a compliance fix. Flagged for Martin. |
| 15 | Off-scale line-heights | F-Low-1 | — | **No action** | — | `styles-desktop.json.fontScale` | `22.75px`/`19.25px` are Tailwind's own `leading-relaxed`/`leading-snug` on 14px. Legitimate; recorded for completeness only. |
| 16 | Circle tab not visually audited | F-Low-2 | all | **Unable to Verify (Environment-Blocked)** | — | `/?tab=circle` silently falls back to Overview without Supabase | Needs a seeded community and a signed-in session. Carries into Pass 11 as a known coverage gap. |

## Investigated and dismissed

* **A dark "N" circle overlapping the Home tab on mobile.** Visible in every
  mobile capture and initially read as a layout collision. `elementsFromPoint`
  at the overlap identifies it as `<nextjs-portal>` — the Next.js dev-tools
  badge, present only under `next dev`. Not app UI, no fix. (The *toast*
  overlap in the same corner, row 12, was real and separate.)

## Deferred, with reasons

* **`ANIMAL_CARD_TONE` (`portfolio-personality.ts:380-556`)** — the 21-hue
  rainbow with `bg-<hue>-500/10` tinted washes. Left open **deliberately**, not
  dropped. It renders on `CommunityView`, which needs a signed-in session and a
  seeded community; this sandbox has neither, so 126 class strings would be
  changed with no way to re-verify the result visually. That fails this pass's
  own standard, and the standard matters more than the row. Two things also need
  Martin's call first: whether 21 archetypes each need their own colour at all,
  and whether the accent should move to a border/`Badge` (per `AGENTS.md`'s
  no-tinted-wash rule) rather than being recoloured in place. Its sibling
  `THEME_COLOR` — which *is* renderable and *was* verified — is fixed, and the
  `--cat-*` ramp it now uses is ready for `ANIMAL_CARD_TONE` to adopt.
* **F-Med-3, F-Med-4** — product calls, see rows 13-14.
* **Senior-designer suggestions S1-S13** — out of scope for the compliance fix
  phase by the pass's own ordering. S1 (re-tune `.glass` alpha now that the blur
  actually runs) is the one worth doing soon; 48% transparent was almost
  certainly chosen to compensate for a blur nobody could see.

## Standing gap for Pass 11

Three items carry **Unable to Verify (WebKit Unavailable)** on iOS: R2-7,
R2-8, R2-13 (rows 1i, 2i, 3i). Every one is specifically a WebKit-vs-Blink
rendering question, and a Chromium stand-in cannot answer it. They must be
confirmed on a real iOS device before anyone treats the glass material as
verified on iOS.
