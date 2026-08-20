# Pass 1 — Visual Cohesion & Design Compliance (Round 2 re-audit)

**Date:** 2026-08-19 · **Mode:** Phase 1, read-only (no component edits, no commits)
**Evidence root:** `audit-current/` (78 files: 39 viewport screenshots × 3 platforms,
close-ups, and machine-extracted computed-style dumps)

> This is a **Round 2 re-derivation**. Nothing in
> `docs/audit/01-visual-cohesion-report-original.md` or the prior fix log was
> carried over as fact. Every row below was re-measured against the running app
> and the current source this round. Where a prior "Resolved" claim survived
> re-testing, it is marked Resolved again with *new* evidence; where it did not,
> it is marked Still Present regardless of what the old log says.

---

## 1. Ground truth used

Resolved live from `getComputedStyle(document.documentElement)` on the running
app (`audit-current/styles-desktop.json`), not read off the docs:

| Token | Authored (`globals.css`) | Resolved in-browser |
|---|---|---|
| `--background` | `oklch(0 0 0)` | `lab(0% 0 0)` — true black ✓ |
| `--card` / `--popover` | `oklch(0.205 0 0)` | `lab(7.78% 0 0)` |
| `--primary` | `oklch(0.8 0.09 90)` | `lab(77.1% 2.4 37.0)` — subtle warm yellow ✓ |
| `--border` | `oklch(1 0 0 / 16%)` | `lab(100% 0 0 / .16)` — hairline, not a fill ✓ |
| `--muted` | `oklch(0.269 0 0)` | `lab(15.2% 0 0)` |
| `--gain` | `oklch(0.696 0.17 162.48)` | `lab(67.0% -58.3 19.5)` → sRGB `rgb(0,188,125)` |
| `--loss` | `oklch(0.645 0.246 16.439)` | `lab(56.1% 79.4 31.5)` → sRGB `rgb(255,32,86)` (gamut-clipped) |
| `--warning` | `oklch(0.63 0.22 45)` | `lab(55.4% 61.7 107.2)` |
| `--radius` | `0.625rem` | `.625rem` ✓ |
| `body` background | — | `lab(0 0 0)` ✓ |

**Accent Palette (the ceiling):** warm yellow `--primary`; orange `--warning`;
emerald `--gain`; rose `--loss`/`--destructive`. Four colors, three semantic.

**Glass material definition (1.1.6):** an elevated surface qualifies as glass only
if real content behind it is *visibly blurred through* it — partial-alpha fill
**plus** a working `backdrop-filter`. A translucent fill with no blur is not
glass; it is a tint. This distinction turns out to be the whole story of this
round (finding C1).

**Light mode:** not applicable. `next-themes` is **not a dependency**, there is no
`ThemeProvider`, no `useTheme` call, and no `prefers-color-scheme` block anywhere
in `globals.css`; `:root` and `.dark` are defined with identical values and `html`
is pinned to `color-scheme: dark`. The app is deliberately dark-only. The brief's
light-mode checks are therefore **Not Applicable**, not "failed" — recorded here so
the gap is not mistaken for an unchecked box.

### Environment accommodations (per 1.0a) — all local, none committed to app source

| Accommodation | What / where | Removal |
|---|---|---|
| Demo-mode render | App runs with no Supabase env, so `SignInGate` renders children directly (`SignInGate.tsx:37`). No auth mock was needed or written for the app pages. | n/a — nothing added |
| Sign-in render | A throwaway `.env.audit.local` with a **stub, non-secret** Supabase URL/key was used *only* to make `supabaseIsConfigured` true so the sign-in screen would render. Never a real credential. | Deleted; `.env*` is gitignored |
| Demo book seed | `data/locked-demo.json` injected into `localStorage["portfell-demo-v8"]` from the Playwright harness | Harness-side only |
| Quote stub | `/api/quotes` fulfilled from a deterministic fixture in the harness, because this sandbox has **no egress to Yahoo/Twelve Data/Finnhub** (`curl` to `query1.finance.yahoo.com` → code 000) | Harness-side only |
| Harness files | `audit-capture.mjs`, `audit-inspect.mjs`, `audit-interact.mjs`, `audit-probe.mjs`, `audit-pixels.mjs`, `audit-dom.mjs` at repo root | Kept through Phase 2 (each fix is re-verified with the same harness that surfaced it), then deleted before the pass closes. `git status` must show them gone. |

**No component file, no `globals.css`, and no token was edited during Phase 1.**

### Platform coverage and its one real gap

* **Desktop** — Chromium 141, 1440×900. Full confidence.
* **Android** — Chromium 141, Pixel 7 descriptor (412×915 @ 2.625×). Full
  confidence: Android Chrome *is* Blink, so this is the real engine.
* **iOS** — **WebKit could not be installed.** `npx playwright install webkit`
  fails in this sandbox (`Failed to download WebKit 26.5 … code=1`), and
  `webkit.launch()` errors with a missing executable. iOS captures are Chromium
  with an iPhone 14 Pro descriptor and are labelled
  **"iOS (Chromium emulation — not verified WebKit)"** throughout. Per 1.0a,
  items **7, 8 and 13** are recorded **Unable to Verify (WebKit Unavailable)** in
  the iOS column — they are precisely the WebKit-vs-Blink questions an emulated
  stand-in cannot answer. This is stated again in the Executive Verdict.

---

## 2. Regression table — both rounds

Desktop and Android are measured. iOS is Chromium-emulated except where marked.

| # | Round | Item | Desktop | iOS | Android | Evidence |
|---|---|---|---|---|---|---|
| 1 | R1 | Hero numeric/emphasized text gray-on-gray with a gradient | **Still Present** (mechanism) | Still Present | Still Present | `SignInGate.tsx:164`; computed `linear-gradient(to right bottom, lab(98.26 0 0) 0%, oklab(… / 0.7) 100%)`, `-webkit-text-fill-color: rgba(0,0,0,0)` — `audit-current/signin-styles.json`. **Measured contrast 19.26:1 → 14.73:1** vs `#000` (see F-High-1) |
| 2 | R1 | Floating unstyled string on Overview, no heading/container | **Resolved** | Resolved | Resolved | Every Overview text block sits inside a `Reading`/`Panel` shell — `audit-current/overview-{desktop,ios,android}-scroll0.png` |
| 3 | R1 | Purple/violet accent must be gone | **Still Present** | Still Present | Still Present | `portfolio-personality.ts:558-570` — `space:"#a78bfa"` (violet-400), `ai_power:"#e879f9"` (fuchsia-400), `semi:"#818cf8"` (indigo-400); rendered at `LabSheet.tsx:502` — `audit-current/lab-desktop.png` |
| 4 | R1 | Button gradients flat gray-to-lighter-gray | **Resolved** | Resolved | Resolved | Zero `linear-gradient` backgrounds on Overview (`styles-desktop.json.gradientBgs` = `[]`); CTA is a flat `--primary` pill — `audit-current/cta-closeup-desktop.png` |
| 5 | R1 | Background gradient invisible / surfaces opaque | folded into 7/8/13 | — | — | — |
| 6 | R1 | "Modern but old and ugly" verdict tension | addressed in §5 | — | — | — |
| 7 | R2 | **Zero translucency — no real `backdrop-blur`** | **Still Present** | **Unable to Verify (WebKit Unavailable)** | **Still Present** | `.glass`/`.glass-well` compile to `-webkit-backdrop-filter` **only**; computed `backdrop-filter: none`. Proof: `audit-current/probe-backdrop.png` — see C1 |
| 8 | R2 | Ugly vertical lighter→darker gray card gradient | **Resolved as authored** (perception caused by C1) | **Unable to Verify (WebKit Unavailable)** | **Resolved as authored** | No `linear-gradient` on any card (`gradientBgs` = `[]`). The vertical ramp measured on the Movers panel (`rgb(28,26,21)` top → `rgb(18,17,15)` bottom) is the ambient glow through a translucent fill, not a card gradient — but with blur dead it *reads* as one. See C1 |
| 9 | R2 | Left accent bar on list/table rows renders broken | **Resolved** | Resolved | Resolved | `OverviewDashboard.tsx:317` — `absolute inset-y-0 left-0 w-1` inside `overflow-hidden rounded-lg`; corners follow the radius cleanly at 1× — `audit-current/movers-closeup-desktop.png`. Colour concern moved to F-Med-1 |
| 10 | R2 | Primary CTA glow overdone (large saturated halo) | **Resolved** | Resolved | Resolved | "Add a holding" computed `box-shadow` is entirely `rgba(0,0,0,0)` stops — no glow at all (`styles-desktop.json.boxShadows`). Zero `drop-shadow` filters app-wide on Overview |
| 11 | R2 | Movers component regressing each iteration | **Partially Fixed** | Partially Fixed | Partially Fixed | See §3 deep-dive |
| 12 | R2 | Watchlist range-knob colour logic inverted | **Resolved** | Resolved | Resolved | `WatchlistStrip.tsx:69-92` — see F-Note-1 for the mapping proof and a correction to the brief |
| 13 | R2 | Ambient gradient abruptly clipped at the header | **Still Present** | **Unable to Verify (WebKit Unavailable)** | **Still Present** | Measured hard edge at cssY≈95 on all three targets: `rgb(0,0,0)` → `rgb(41,41,41)` → `rgb(45,40,25)` across ~2 CSS px. Cause: `AppHeader.tsx:122` |
| 14 | R2 | Unexplained green glow bottom-right | **Still Present** (sign-in only) | Still Present | Still Present | `SignInGate.tsx:257` `to-gain/10`; measured `rgb(1,15,9)` / `rgb(0,9,5)` at (1330,560)/(1380,620) — G-dominant — vs warm `rgb(37,34,21)` top-left. **Resolved on all signed-in pages** |
| 15 | R2 | Top metric cards oversized / wasting vertical space | **Resolved** | Resolved | Resolved | 4-up row, ~130px tall for label + figure + sub-line — `audit-current/overview-desktop-scroll0.png` |
| 16 | R2 | Buttons need a full craft pass | **Resolved** | Resolved | Resolved | One `Button` primitive (`data-slot="button"`), consistent variants, no per-call-site shadow invention |
| 17 | R2 | Hover/glow/animation restraint app-wide | **Partially Fixed** | Partially Fixed | Partially Fixed | Signed-in pages: largest shadow is `0 12px 32px -16px black/.85` (restrained, negative spread), zero drop-shadows. Sign-in still ships a 395×666px `blur(64px)` halo at `opacity-90` — `SignInGate.tsx:257` |

**Score: 4 of 17 Still Present (items 1, 3, 7, 13, 14 — 5 rows), 2 Partially Fixed,
3 iOS cells Unable to Verify, the rest Resolved with fresh evidence.**

---

## 3. Movers component deep-dive (R2 item 11)

Implementation: `DriverTile` (`OverviewDashboard.tsx:299-364`), used by both the
"A few holdings did most of the moving today" strip and the Movers panel
(`OverviewDashboard.tsx:971`). Close-ups: `audit-current/movers-closeup-{desktop,ios,android}.png`.

**What is genuinely fixed this round (all three platforms):**

* One shared component now backs all three "who moved the number" surfaces, so the
  three-different-card-styles problem is gone (`OverviewDashboard.tsx:291-297`).
* The left accent bar is `absolute inset-y-0 left-0 w-1` inside an
  `overflow-hidden rounded-lg` shell — it clips to the card radius, no corner
  mismatch, no glow bleed. R2 item 9 is genuinely closed.
* Card interior is flat: a vertical pixel scan at x=300 reads `rgb(22,22,20)` at
  y=95 through `rgb(22,21,20)` at y=175 — no banding, no fake gradient.
* Colour encoding is correct: gainers get `--gain` bar + `ring-gain/20`, losers
  `--loss` + `ring-loss/20`.

**What is still wrong, per platform:**

1. **(All) The panel has no glass.** With `backdrop-filter` dead (C1), the outer
   `.glass` panel is a flat 52%-alpha tint over the ambient glow. The measured
   top-to-bottom ramp (`rgb(28,26,21)` → `rgb(18,17,15)`, ≈36% relative
   luminance drop over 430px) is a smooth unblurred wash — which is *exactly* the
   "lighter gray at top fading to darker gray at bottom" the reviewer described.
   Item 8 was reported as a card gradient; it is not one. It is item 7 wearing
   item 8's clothes. **Fixing C1 fixes both.**
2. **(All) `--loss` clips out of sRGB.** The red bar measures `rgb(255,32,86)` —
   fully saturated, channel-clipped, and visually much louder than the gain bar's
   in-gamut `rgb(0,188,125)`. Two semantic colours of supposedly equal weight are
   not balanced; the loss side reads hot and cheap next to a calm green. This is
   the single biggest remaining contributor to Movers looking garish.
3. **(All) Ragged final row.** Five movers in a 2-column grid leave an empty
   bottom-right cell (measured `rgb(16,15,14)` at (860,360) — no ghost fill, so
   `AGENTS.md`'s painted-cell rule is not violated, but the row still reads
   unfinished).
4. **(Mobile) Single-column stack loses the comparison.** On both mobile targets
   the five cards stack full-width, so the at-a-glance gainer/loser split that
   the two-column desktop layout gives you is gone; it becomes a long scroll of
   near-identical cards.

**Verdict on "regressing each iteration":** not this round. Structure, accent bar,
and colour encoding are all better than the report they were flagged in. What has
*not* improved is the material — and that is C1, not Movers.

---

## 4. Findings, by severity

### Critical

**C1 — The glass material does not render in any Blink browser: `.glass` /
`.glass-well` ship `-webkit-backdrop-filter` only.**
*Files:* `src/app/globals.css:242-243` (`.glass`), `:256-257` (`.glass-well`).
*Rows:* R2-7 (and the true cause of R2-8, and of the Movers complaint).
*Platforms:* Desktop **Still Present**, Android **Still Present**, iOS
**Unable to Verify (WebKit Unavailable)** — though on WebKit it very likely
*does* work, which is why this has gone unnoticed on a phone.

The source authors both properties:

```css
backdrop-filter: blur(28px) saturate(1.6);
-webkit-backdrop-filter: blur(28px) saturate(1.6);
```

The **compiled** stylesheet keeps only the prefixed one:

```
$ curl -s localhost:3000/_next/static/chunks/…css | sed -n '8677,8681p'
  .glass {
    -webkit-backdrop-filter: blur(28px) saturate(1.6);
    box-shadow: inset 0 0 0 1px var(--border),
      0 12px 32px -16px #000000d9;
  }
```

The unprefixed declaration is gone from the entire bundle for these two rules.
Chromium 141 does **not** honour the `-webkit-` alias —
`CSS.supports("-webkit-backdrop-filter","blur(10px)")` → `false`, and an element
carrying only that property computes `backdrop-filter: none`. The visual proof is
`audit-current/probe-backdrop.png`: two identical 52%-alpha panels over a striped
backdrop, left with `-webkit-backdrop-filter` only (**hard, unblurred stripes**),
right with the standard property (**blurred**).

Consequence, measured on the live app: every `.glass` card computes
`background-color: oklch(0.205 … / 0.52)` — the translucency landed — with
`backdrop-filter: none`. So the app has *tint without blur* on every top-level
card and every nested well, on desktop Chrome, Edge, and Android Chrome.

Two details worth carrying into the fix:

* This is **not** a Tailwind bug. `backdrop-blur-xl` on the desktop header
  (`AppHeader.tsx:78`) compiles correctly with *both* properties (compiled CSS
  line 5352-5355) and does blur. Only the two hand-written utilities in
  `globals.css` are affected.
* The `-webkit-` line was almost certainly added as a defensive polyfill. It is
  the thing that broke the standard property.

*Fix:* emit the standard `backdrop-filter` last (or drop the redundant prefixed
line entirely — Safari has shipped unprefixed `backdrop-filter` since 18), then
re-check the compiled bundle, not the source.

**C2 — The chrome band terminates the ambient glow at a razor edge.**
*File:* `src/app/globals.css:175-192` (`.page-frame::before`, `position: fixed;
inset: 0`) vs `src/components/AppHeader.tsx:122` and
`src/components/mobile/MobileTopBar.tsx:74`.
*Row:* R2-13. Desktop **Still Present**, Android **Still Present**, iOS
**Unable to Verify (WebKit Unavailable)**.

The glow is correctly `position: fixed; inset: 0` so it *does* sit behind the
chrome. The header itself is translucent on desktop (`bg-background/75
backdrop-blur-xl`, `AppHeader.tsx:78`) — that part is right. But the status-strip
wrapper directly beneath it is **fully opaque with no blur**:

```tsx
// AppHeader.tsx:122
<div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 bg-background md:fixed md:top-14 …">
```

and on mobile the header *itself* is opaque too:

```tsx
// MobileTopBar.tsx:74
"sticky top-0 z-40 bg-background pt-[env(safe-area-inset-top)] md:hidden"
```

Vertical pixel scan at x≈30 CSS px, all three targets, identical result:

| cssY | Desktop | Android | iOS (emulated) |
|---|---|---|---|
| 94 | `rgb(0,0,0)` | `rgb(0,0,0)` | `rgb(0,0,0)` |
| 96 | `rgb(41,41,41)` ← border hairline | `rgb(41,41,41)` | `rgb(41,41,41)` |
| 98 | `rgb(45,40,25)` | `rgb(45,40,26)` | `rgb(47,42,27)` |

A 0 → 45 step across ~2 CSS px. That is the "hard, ugly cutoff" verbatim, and it
is caused by an opaque slab, not by the glow being mis-positioned. On mobile it is
worse: the whole 94px band is opaque, so there is no translucency in the chrome at
all.

*Fix:* give the status strip the same `bg-background/75 backdrop-blur-xl`
treatment as the header, and give `MobileTopBar` a translucent glass fill.

**C3 — Purple/violet/fuchsia/indigo are still shipped and rendered.**
*File:* `src/lib/portfolio-personality.ts:558-570` (`THEME_COLOR`), rendered at
`src/components/LabSheet.tsx:502,513`. *Row:* R1-3. All three platforms.

```js
crypto:"#f59e0b"  space:"#a78bfa"  ai_infra:"#38bdf8"  drones:"#22d3ee"
semi:"#818cf8"    ai_power:"#e879f9" fintech:"#34d399" software:"#60a5fa"
other:"#a1a1aa"   healthcare:"#fb7185" index:"#2dd4bf"
```

`#a78bfa` is violet-400, `#e879f9` fuchsia-400, `#818cf8` indigo-400, `#f59e0b`
amber-500 — four of the explicitly banned hues, as **hardcoded hex literals**
(not tokens), rendered as the "What you're actually betting on" bar on the Lab
page (`audit-current/lab-desktop.png`: cyan / magenta / indigo / purple / amber /
green / grey, left to right).

`ANIMAL_CARD_TONE` (`:380-556`) is a second, larger offender: a **21-hue rainbow**
(`bg-purple-400`, `bg-violet-400`, `bg-fuchsia-400`, `bg-indigo-400`, `bg-amber-400`,
…) each with a `wash: "bg-<hue>-500/10"` tinted card background — the exact
"tinted/muddy card-background wash" `AGENTS.md` bans by name.

**`DESIGN_TOKENS.md` is wrong about this.** Its final section states
`ANIMAL_CARD_TONE` is "dead code — confirmed via grep that nothing in `src/`
imports or renders this export." That is no longer true: `LabSheet.tsx:12`,
`CommunityView.tsx:90`, `UpsidePortfolioPage.tsx:43`, `TickerDrawer.tsx:28`,
`allocation.ts:7`, and `book-insights.ts:13` all import from this module, and
commit `8ea765a` ("Split Panda/Octopus power animals into theme- and
risk-specific variants") made the animal tones live.

*Fix (needs a decision — flagged per the ground rules):* a categorical bar with 11
series legitimately cannot be encoded in a 4-colour palette, so the honest fix is
**not** "delete the colours." It is to add a deliberate, restrained, token-backed
**categorical ramp** to `DESIGN_TOKENS.md` — which that file itself requires
("nothing outside this list without updating this file first") — and drive both
tables from it, dropping the banned hues and the hardcoded hex. `ANIMAL_CARD_TONE`'s
decorative `wash`/`well` tints have no such excuse and should go to neutral
surfaces with the accent carried on a border or `Badge`.

### High

**F-High-1 — Hero headline still uses a gradient text fill (R1-1).**
`SignInGate.tsx:164`: `bg-gradient-to-br from-foreground to-foreground/70
bg-clip-text … text-transparent`. Graded Critical-by-rubric in the table above
because the named mechanism is still present, but stated honestly here: **the
legibility complaint no longer holds.** Brightest-glyph contrast measured across
the headline is 19.26:1 (start) → 14.73:1 (tail) against `#000`, i.e. WCAG AAA at
both ends. It is the last gradient-text instance in the app (`gradientText` is
`[]` on every signed-in page) and is cheap to remove — the reason to remove it is
consistency with the brief, not accessibility.

**F-High-2 — Mobile text buttons are below both platform touch minimums.**
Measured on Pixel 7 and iPhone 14 Pro (`audit-current/touch-{android,ios}.json`),
8 interactive elements under 44px tall, all at 28-32px:

| Element | Measured |
|---|---|
| "Import screenshot" | 162×**32** |
| "Import CSV" | 117×**32** |
| "Add holding manually" | 183×**32** |
| "Ask Margus" (×2) | 120×**32** |
| "Cash $0.00" | 96×**28** |
| "Upside Lab" brand link | 115×**20** |

iOS HIG asks 44×44pt, Material 48×48dp. `globals.css:340-352` claims this was
closed by a prior pass, but that rule is scoped to
`[data-slot="button"][data-size="icon-sm"|"icon-xs"]` — **icon buttons only**. The
default `size="sm"` text button is `h-8` (32px) and was never covered. A prior
"Resolved" that does not hold.

**F-High-3 — The sign-in halo is the one remaining overdone glow (R2-17).**
`SignInGate.tsx:257`: `-inset-8 … opacity-90 blur-3xl` computes to a **395×666px**
element with `filter: blur(64px)` at 90% opacity. Every signed-in page is clean by
comparison (largest shadow `0 12px 32px -16px`, zero drop-shadows), so this is a
single outlier on the first screen a stranger sees.

**F-High-4 — `DESIGN_TOKENS.md` is stale in five verifiable ways.**
Flagged per 1.1.2. It is currently the *least* reliable description of the system:

| Claim | Actual |
|---|---|
| `.glass` = `transparent 25%` + `blur(20px)` | `transparent 48%` + `blur(28px) saturate(1.6)` |
| `.glass-well` has "no blur of its own" | `blur(16px) saturate(1.4)` |
| Ambient glow "30%/22%, 1600px/1400px, one in gain-green" | 24%/12%, 1700×1300 / 1300×1000, **primary only** — `globals.css:168-172` explicitly removed the green |
| Button `default` has a three-stop gradient | Zero `linear-gradient` backgrounds render anywhere on Overview |
| `ANIMAL_CARD_TONE` is unreferenced dead code | Imported by six modules; rendered live |

### Medium

**F-Med-1 — `--loss` is out of sRGB gamut and unbalanced against `--gain`.**
`--loss: oklch(0.645 0.246 16.439)` clips to `rgb(255,32,86)` — a channel-maxed,
fully saturated red — while `--gain` resolves in-gamut to `rgb(0,188,125)`. Two
colours meant to carry equal semantic weight read at very different intensities;
the loss side is the loudest thing on the Movers panel. Lowering chroma to roughly
`0.19-0.20` brings it inside sRGB and to parity with gain without changing its
meaning.

**F-Med-2 — `--loss` used for non-P&L numbers.** Lab → Allocation renders
"Largest position 37.3%" and "Top 5 combined 87.6%" in loss-rose
(`audit-current/lab-desktop.png`). These are concentration warnings, not losses;
`--warning` exists for exactly this and is what the palette table assigns to
"caution states." Using the P&L colour for a non-P&L figure weakens both.

**F-Med-3 — Movers' ragged final row.** Five cards in a 2-column grid. No painted
ghost cell (verified `rgb(16,15,14)`), so not an `AGENTS.md` violation, but a
`HairlineGrid`/`Segmented` treatment or an even count would finish the block.

**F-Med-4 — Mobile Movers loses its comparison value.** Full-width single-column
stack on both mobile targets turns a scannable gainer/loser split into a long
scroll.

### Low

**F-Low-1 — Three off-scale line-heights.** `22.75px` and `19.25px` on 14px text
(Tailwind's `leading-relaxed`/`leading-snug`). Legitimate utilities, noted only for
completeness. Otherwise the type scale is clean: sizes 12/14/16/18/20/24px,
weights 400/500/600/700, `text-xs` floor respected, no `text-[13.5px]`-style
one-offs anywhere (`styles-desktop.json.fontScale`, 18 combinations total).

**F-Low-2 — Circle tab unreachable in demo mode.** `/?tab=circle` silently falls
back to Overview without Supabase, so Circle could not be visually audited this
round. Recorded as a coverage gap, not a defect.

### Notes / corrections to the brief

**F-Note-1 — R2-12 (slider knob colour) is correct, and there is no drag to test.**
`WatchlistStrip.tsx:69-92`:

```tsx
const pos = span > 0 ? Math.min(1, Math.max(0, (price - low) / span)) : 0.5;
backgroundColor: `color-mix(in oklch, var(--gain) ${pos*100}%, var(--loss) ${(1-pos)*100}%)`
```

At the high end `pos → 1` → 100% `--gain` (green). At the low end `pos → 0` →
100% `--loss` (red). The mapping direction is correct in both directions and the
value is clamped. The brief asks to verify "touch-drag behavior on iOS/Android" —
this element is `role="meter"`, a read-only indicator, not a slider. There is no
drag interaction to verify, on any platform.

---

## 5. Executive verdict

**The glass direction was attempted, and it is one CSS declaration away from
working.** This is the finding that reframes the whole round. Every ingredient is
in place — a true-black field, a 48%-alpha card fill, a fixed full-viewport ambient
glow correctly layered behind the page, hairline borders, a sheen highlight, a
restrained lift shadow — and the app still does not look like glass in Chrome or
Android Chrome for exactly one reason: the compiled `.glass` rule ships
`-webkit-backdrop-filter` and drops the standard `backdrop-filter`, so the blur
never runs on Blink. What is left is tint-without-blur, which is precisely the
material a reviewer would describe as "an ugly vertical gray gradient" — you are
seeing the ambient glow ramp through an unblurred film. Item 8 was diagnosed as a
card gradient; there is no card gradient anywhere in the app. The two complaints
are one bug.

**So: is structure outpacing surface execution?** Yes, but far less than the brief
assumes, and not in the way it assumes. Structure is genuinely good — one `Button`
primitive, one `DriverTile` behind three surfaces, a clean 12/14/16/18/20/24 type
scale with a `text-xs` floor, `font-mono tabular-nums` on the figures, hairline
borders instead of fills, real shadcn primitives throughout, and a shadow
vocabulary that is already restrained (the loudest thing on any signed-in page is
`0 12px 32px -16px` at 85% black — there is not a single `drop-shadow` filter on
Overview). The "overdone CTA glow," the "flat gray button gradients," the "broken
left accent bar," the "oversized metric cards" and the "inverted slider logic" are
all genuinely fixed, and I re-derived each rather than trusting the log. The
surface fails on three things only: a dead blur, an opaque slab clipping the glow
at cssY=95, and a rainbow that never got the memo. "Modern but old and ugly" is
now mostly "modern, correct, and unrendered."

**Is mobile materially behind desktop?** Yes, on two specific counts, and both are
mobile-only regressions rather than mobile lagging a desktop fix. The mobile
header is `bg-background` — fully opaque, no blur — where the desktop header is
`bg-background/75 backdrop-blur-xl`, so mobile has *no* translucent chrome at all
and the glow cutoff is a 94px black slab instead of a 38px one. And eight text
buttons sit at 28-32px against a 44pt/48dp minimum, under a prior fix that only
ever covered icon buttons. Layout, spacing, type and safe-area padding are
otherwise sound on both mobile targets.

**One thing this round cannot tell you.** WebKit would not install, so the three
items that are specifically about WebKit-vs-Blink rendering — 7, 8 and 13 — carry
**Unable to Verify** in the iOS column and must not be read as passing there.
There is a real possibility that iOS Safari is the *only* place the glass has ever
worked, since it is the one engine that honours the prefixed property the bundle
actually ships. That should be confirmed on a real device before anyone concludes
the material is fine anywhere.

---

## 6. Scorecard

Legend: ✅ pass · ⚠️ partial · ❌ fail · — not applicable · ? unable to verify

| Page × Platform | Banned colour | Glass material | Glow/header | Effect restraint | Type scale | Touch targets | Primitives |
|---|---|---|---|---|---|---|---|
| Overview · Desktop | ✅ | ❌ C1 | ❌ C2 | ✅ | ✅ | — | ✅ |
| Overview · iOS (emul.) | ✅ | ? | ? | ✅ | ✅ | ❌ F-High-2 | ✅ |
| Overview · Android | ✅ | ❌ C1 | ❌ C2 | ✅ | ✅ | ❌ F-High-2 | ✅ |
| Pulse · Desktop | ✅ | ❌ C1 | ❌ C2 | ✅ | ✅ | — | ✅ |
| Pulse · iOS/Android | ✅ | ?/❌ | ?/❌ | ✅ | ✅ | ❌ | ✅ |
| Lab/Allocation · Desktop | ❌ C3 | ❌ C1 | ❌ C2 | ✅ | ✅ | — | ✅ |
| Lab/Allocation · iOS/Android | ❌ C3 | ?/❌ | ?/❌ | ✅ | ✅ | ❌ | ✅ |
| Compound · all | ✅ | ❌/? | ❌/? | ✅ | ✅ | ❌ | ✅ |
| Communities · all | ✅ | ❌/? | ❌/? | ✅ | ✅ | ❌ | ✅ |
| Circle · all | ? F-Low-2 | ? | ? | ? | ? | ? | ? |
| Sign-in · Desktop | ✅ | ❌ C1 | ✅ | ❌ F-High-3 | ⚠️ F-High-1 | — | ✅ |
| Sign-in · iOS/Android | ✅ | ?/❌ | ✅ | ❌ | ⚠️ | ❌ | ✅ |
| Account/Terms/Privacy · all | ✅ | ❌/? | ❌/? | ✅ | ✅ | ❌ | ✅ |

---

## 7. Grep / CSS evidence appendix

```
# Purple/violet/fuchsia/indigo — R1-3, STILL PRESENT
$ grep -rniE "purple|violet|indigo|fuchsia" src/ --include=*.ts --include=*.tsx
src/lib/portfolio-personality.ts:455:    border: "border-fuchsia-500/45",
src/lib/portfolio-personality.ts:470:    bar: "bg-violet-400",
src/lib/portfolio-personality.ts:478:    bar: "bg-purple-400",
src/lib/portfolio-personality.ts:526:    bar: "bg-indigo-400",
src/lib/portfolio-personality.ts:560:  space: "#a78bfa",      # violet-400
src/lib/portfolio-personality.ts:563:  semi: "#818cf8",       # indigo-400
src/lib/portfolio-personality.ts:564:  ai_power: "#e879f9",   # fuchsia-400
   (+ 21-hue ANIMAL_CARD_TONE table, lines 380-556)

# Gray-to-gray card gradient — R2-8, NOT PRESENT as authored
$ grep -rnE "bg-gradient-to-b|linear-gradient" src/ --include=*.tsx
src/components/SignInGate.tsx:164   # text fill, not a card  (R1-1)
src/components/SignInGate.tsx:257   # the halo               (F-High-3)
src/components/SignInGate.tsx:265   # 96px top sheen, to-transparent
   -> styles-desktop.json .gradientBgs == []   (zero on every signed-in page)

# CTA glow — R2-10, RESOLVED
"Add a holding" computed box-shadow:
  rgba(0,0,0,0) 0px 0px 0px 0px, rgba(0,0,0,0) 0px 0px 0px 0px, ...   # all-transparent
styles-desktop.json .dropShadows == []

# Glass blur — C1
$ curl -s .../[root-of-the-server]__*.css | sed -n '8677,8679p'
  .glass { -webkit-backdrop-filter: blur(28px) saturate(1.6); box-shadow: ... }
$ node -e "CSS.supports('-webkit-backdrop-filter','blur(10px)')"  ->  false
   computed on every .glass element:  backdrop-filter: none
   visual proof: audit-current/probe-backdrop.png

# Header / glow stacking — C2
src/components/AppHeader.tsx:78    "... bg-background/75 backdrop-blur-xl md:block"   # OK
src/components/AppHeader.tsx:122   "... z-30 bg-background md:fixed md:top-14 ..."    # OPAQUE
src/components/mobile/MobileTopBar.tsx:74  "sticky top-0 z-40 bg-background ..."      # OPAQUE
   pixel scan x=30: cssY 94 rgb(0,0,0) -> 96 rgb(41,41,41) -> 98 rgb(45,40,25)

# Light mode
$ grep -rn "next-themes|ThemeProvider|useTheme" src/ package.json   ->  (no matches)
$ grep -n "prefers-color-scheme" src/app/globals.css                ->  (no matches)
```

---

## 8. Cross-page consistency

Consistent app-wide and verified this round: the `Button` primitive and its
variants; `DriverTile` behind all three "who moved" surfaces; `Panel`/`Reading`
shells; hairline `--border` edges rather than lightness steps; `font-mono
tabular-nums` on every figure; the 12/14/16/18/20/24 type scale; `lucide-react`
icons at a consistent stroke and size; the currency chip rule (`USD`/`EUR`/`GBP`
chips appear on Pulse because the demo book is genuinely mixed-currency, which is
what `AGENTS.md` specifies).

Inconsistent: the Lab page is the only surface using colour outside the Accent
Palette (C3) and the only one using `--loss` for a non-P&L number (F-Med-2); the
mobile header is the only chrome surface with no translucency (C2); the sign-in
page is the only surface with a heavy blur halo (F-High-3) and the only one with
gradient text (F-High-1). Every one of those is a single-surface outlier against
an otherwise coherent system — which is a good position to be in.

---

## 9. Senior-designer suggestions (separate from compliance)

**App-wide**

| # | Suggestion | Impact | Effort |
|---|---|---|---|
| S1 | Once C1 lands, re-tune `.glass` alpha. 48% transparent was almost certainly chosen to compensate for a blur nobody could see; with a real 28px blur it will likely read too thin. Expect to land nearer 30-35%. | High | S |
| S2 | Add an edge-highlight token. `.card-sheen` gives a top hairline; Apple's material also brightens the *bottom* edge where light wraps. A second inset stop would add depth for one line of CSS. | Medium | S |
| S3 | Bring `--loss` into sRGB (F-Med-1). Cheapest single change to stop the app reading garish. | High | S |
| S4 | Define a categorical data-viz ramp in `DESIGN_TOKENS.md` — 6-8 low-chroma hues at a fixed lightness, derived from the palette rather than picked from Tailwind. Fixes C3 properly instead of suppressing it. | High | M |
| S5 | The ambient glow is warm-only top-left and bottom-right. With blur working, consider dropping the bottom-right lobe entirely — one light source reads more expensive than two. | Medium | S |
| S6 | `AGENTS.md`, `DESIGN_TOKENS.md` and the code have drifted (F-High-4). A tiny check asserting the compiled CSS contains unprefixed `backdrop-filter` would have caught C1 at build time. | High | S |

**Sign-in**

| # | Suggestion | Impact | Effort |
|---|---|---|---|
| S7 | Replace the 64px halo (F-High-3) with the same `.page-frame::before` treatment the app uses. One ambient system, not two. | High | S |
| S8 | Drop the headline gradient (F-High-1). Solid `--foreground` on a 24px heading is more confident than a fade. | Medium | S |

**Overview / Movers**

| # | Suggestion | Impact | Effort |
|---|---|---|---|
| S9 | Even the Movers count (4 or 6) or fill the last row (F-Med-3). | Low | S |
| S10 | On mobile, make Movers a horizontal snap rail rather than a stack (F-Med-4) — keeps the comparison and costs less vertical space. | Medium | M |
| S11 | "Portfolio $1,121,500" renders in `--primary` while its three neighbours are `--gain`. If yellow means "this is the headline number," fine; if it is incidental, neutral would let the green earn its attention. | Low | S |

**Lab**

| # | Suggestion | Impact | Effort |
|---|---|---|---|
| S12 | The theme bar is the best data-viz in the app and is let down entirely by its palette. S4 fixes it. | High | S (after S4) |
| S13 | Move concentration figures to `--warning` (F-Med-2). | Medium | S |

---

## 10. Prioritised punch list (Phase 2 order of operations)

### A. Compliance — 1.2 items first, in order

1. **R2-7 / C1** — restore unprefixed `backdrop-filter` on `.glass` + `.glass-well`; verify in the **compiled** bundle and by re-screenshotting.
2. **R2-8** — re-check the Movers panel ramp after C1; confirm it now reads as blurred glass rather than a gray gradient.
3. **R2-13 / C2** — make the status strip and `MobileTopBar` translucent + blurred; re-run the vertical pixel scan on all three targets.
4. **R2-14** — remove `to-gain/10` from the sign-in halo; re-measure the bottom-right pixels for a warm (R>G) reading.
5. **R1-3 / C3** — add a categorical ramp to `DESIGN_TOKENS.md`, then drive `THEME_COLOR` and `ANIMAL_CARD_TONE` from tokens; re-run the purple grep to empty.
6. **R1-1 / F-High-1** — remove the sign-in headline gradient; re-check `gradientText` is `[]` app-wide.
7. **R2-17 / F-High-3** — shrink or replace the sign-in halo.

### B. Remaining Critical/High

8. **F-High-2** — extend the touch-target rule to `size="sm"`/`size="default"` text buttons on coarse pointers; re-measure on both mobile targets.
9. **F-High-4** — rewrite `DESIGN_TOKENS.md` against measured values.

### C. Medium / Low

10. F-Med-1 (`--loss` gamut) · 11. F-Med-2 (concentration → `--warning`) ·
12. F-Med-3 (Movers row) · 13. F-Med-4 (mobile Movers rail) · 14. F-Low-1 (note only)

### D. Design-quality suggestions

S1-S13, after A-C.

**Deferred with reason:** F-Low-2 (Circle unreachable without Supabase — needs a
seeded community, not a code fix). All iOS cells on items 7/8/13 stay
**Unable to Verify** until this runs somewhere with a real WebKit engine; they do
not get upgraded on the strength of a code change looking right.
