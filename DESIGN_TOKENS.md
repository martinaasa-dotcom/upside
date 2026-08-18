# Design tokens — deep-black system

Source of truth: the sign-in landing page (`src/components/SignInGate.tsx`).
Its background, card, border, and radius are the *same tokens* the rest of
the app already uses (`bg-background`, `bg-card`, `border-border`,
`--radius`) — verified by reading the component source, not by eyeballing
a screenshot. So the fix here is narrower than "redesign everything": the
base (black field, card step, hairline borders, radius scale) was already
correct and already shared with the landing page. The one real gap was
`--primary`, which was gold — everything below documents that change and
nothing else moves.

## Verified-correct, unchanged

These were checked against the landing page's actual source and are
already consistent app-wide. Do not "fix" them again in a future pass —
they're not the gap.

| Token | Value | Note |
|---|---|---|
| `--background` | `oklch(0 0 0)` | True black already. Not the grayish-charcoal the brief worried about — that description was actually about `--card`, and `--card` is already correct too (next row). |
| `--card` / `--popover` | `oklch(0.205 0 0)` | shadcn's own official dark-mode default (see the comment above it in `globals.css`). The landing page's own `Panel` (the `BookStill` sample card) uses this exact same `bg-card` class — no separate "landing page shade" exists. |
| `--border` | `oklch(1 0 0 / 16%)` | White at 16% alpha — a hairline, not a filled color. This is how the landing page defines its card edges (`ring-1 ring-foreground/10`-style patterns) instead of a lightness step. |
| `--radius` | `0.625rem` | Unchanged; standard shadcn scale, already used everywhere. |
| `--gain` / `--loss` | `oklch(0.696 0.17 162.48)` / `oklch(0.645 0.246 16.439)` | Semantic, not brand — explicitly out of scope for the accent retirement. Crisp emerald/rose, used only for gains/losses. |

## Pass 1: gold → violet (superseded — see Pass 2 below)

Old: `oklch(0.762 0.102 80)` — "Gold Delta," hue 80° (gold/amber territory).
This is the color the muddy `bg-amber-950/20`-style tinted card washes and
dull gold buttons were built from — a real, confirmed gap, not a
misreading.

New: `oklch(0.62 0.24 291)` — a saturated violet. Distinct from
gain-green (162°) and loss-rose (16°) so it never gets confused with a
financial signal; high chroma so it stays vivid on true black instead of
reading as a muted brand tint. `--primary-foreground` moves from
near-black (`oklch(0.145 0 0)`, needed for readable text on light gold) to
near-white (`oklch(0.985 0 0)`, needed for readable text on a mid-dark
violet).

Everything that referenced `--primary` — buttons, focus rings, the
sidebar accent, the `--select`/`--brand*` aliases, the landing page's own
ambient glow and card ring (`bg-primary/20`, `ring-primary/15`,
`shadow-[..._var(--primary)]`) — inherits this automatically, since they
were already token references, not hardcoded gold values. That's the
whole fix for 90% of the gold surface area.

## Warning/caution semantic

`--warning` (and `--chart-3`, which shared its value) was also gold-hued
(`oklch(0.769 0.188 70.08)`, hue 70°) — banned under "yellow/amber/gold in
any form," no semantic carve-out given for it the way gain/loss got one.
Moved to a true orange, hue 45° — clearly on the red/orange side of the
wheel, not the yellow/gold side, so it doesn't quietly reintroduce the
banned hue under a different name.

New: `--warning` / `--chart-3`: `oklch(0.63 0.22 45)`.

## Accent Palette (the ceiling — nothing outside this list without updating this file first)

| Color | Token(s) | Allowed for |
|---|---|---|
| Warm yellow | `--primary`, `--ring`, `--sidebar-primary`, `--sidebar-ring` | Primary buttons, focus rings, active/selected states, the main chart line/gradient, icon-badge accents (landing page bullet icons), card ring accents. This is the one brand accent. |
| Orange | `--warning`, `--chart-3` | Caution/warning states only (e.g. Pulse alert badges). Not a general-purpose accent — don't reach for it decoratively. |
| Emerald | `--gain` | Gains only. Semantic, not brand. |
| Rose | `--loss` / `--destructive` | Losses and destructive actions only. Semantic, not brand. |

Four colors total, three of them semantic single-purpose (warning/gain/loss)
and one general brand accent (warm yellow). Nothing else gets a new color
without adding a row here first.

## Pass 2: violet → subtle warm yellow, plus glass surfaces

The violet from Pass 1 (above) tested live and didn't land — the request
this time was explicitly "white, or a subtle yellowish tone," landing on
the yellow option. New value: `--primary: oklch(0.8 0.09 90)` (was
`oklch(0.62 0.24 291)`). Lower chroma and a hue further from orange than
the original "Gold Delta" (`oklch(0.762 0.102 80)`, hue 80°) — this reads
as a quiet warm neutral, not a bright brand color, and sits far enough
from `--warning`'s hue 45° that the two don't get confused.
`--primary-foreground` moves back to near-black (`oklch(0.145 0 0)`), same
reasoning as the original gold: light backgrounds need dark text.

Same pass added two shared utility classes in `globals.css`:

- **`.glass`** — `background-color: color-mix(in oklch, var(--card),
  transparent 25%)` plus `backdrop-filter: blur(20px)`. The standard fill
  for every top-level card/panel (`BOX`, `SCORE_CELL`, `SHELL_TONES`,
  `LIST`, `Reading`, the shadcn `Card` primitive, and the hand-rolled
  `bg-card ring-1 ring-foreground/10` pattern that recurred across ~13
  files) — translucent instead of opaque so the ambient corner glow shows
  through, blurred, instead of stopping dead at the card edge.
- **`.glass-well`** — same idea for nested `bg-muted` wells, lighter
  translucency (35% transparent), no blur of its own (it's already inside
  a blurred ancestor).
- **`.card-sheen`** changed from a `--card`-to-lighter-`--card` gradient
  to a white-to-transparent specular wash. The old version's stops were
  both opaque, so layering it over `.glass`'s translucent
  `background-color` would have fully re-opaqued the card (`background-
  image` paints over `background-color`) and silently cancelled the glass
  effect. The new version never references `--card` at all, so it composes
  with either an opaque or translucent base underneath.

The ambient glow itself (`.page-frame::before`) also got stronger — 16%/12%
opacity and 1200px/900px radii became 30%/22% and 1600px/1400px — since
translucent cards dilute whatever glow sits behind them, and the ask was
explicitly to see it through the cards, not just in the gutters between
them.

The button `default` variant's gradient changed from a two-stop
lighten-toward-white wash to a three-stop highlight/base/shadow gradient
(`white 25%` → base → `black 15%`) plus an inset top highlight
(`box-shadow: inset 0 1px 0 ...`). The old version mixed a *light* primary
toward white, which reads as almost no gradient at all — the fix for "no
button looking boxes" (Pass 2) is not the same fix as "buttons look flat
and gray" (this pass); the former was about affordance, this one is about
the gradient having enough dynamic range to read as a lit surface instead
of two adjacent shades of pale.

## Removed as dead code

`--accent-amber` and `--mustard` were defined in `globals.css` but never
consumed by any component (`grep` confirms zero usages of the
`accent-amber`/`mustard` Tailwind utilities anywhere in `src/`). Deleted
outright rather than recolored, since renaming/recoloring something
nothing reads from would just be more dead weight with a less-honest name.

## Gradient/glow pattern (from the landing page, now shared app-wide)

The landing page's ambient background — two large, heavily blurred radial
shapes, one in the primary color at low opacity, one in gain-green at
lower opacity — is now the shared `.page-frame::before` treatment
(`src/app/globals.css`) instead of a landing-page-only effect. It already
read this way from an earlier pass in this repo's history; this token
change is what makes it reference the new violet instead of gold.

## Explicitly out of scope for this pass

- **`src/lib/book-shock.ts`**'s `"gold"` sector key (GLD/IAU/SLV/GDX/GDXJ) —
  this is the literal commodity, a portfolio-classification label, not a
  color token. Untouched.
- **Email templates** (`src/lib/email-letter.ts`, `src/lib/note-report.ts`)
  — hardcoded hex (`#d6ad69`) in raw HTML-email inline styles, a separate
  rendering surface (Resend-sent mail, not the web app) that this sandbox
  can't visually verify across mail clients. Left as-is; flagging as a
  known follow-up rather than guessing at a fix I can't check.
- **The logo mark** (`/public/upside-mark.png`, referenced from
  `UpsideLogo.tsx`) — a static raster asset (also used as the favicon, OG
  image, and X profile image), not a CSS-token-driven element. Recoloring
  it is a graphic-design task outside a token/component pass, and nobody
  asked for the brand mark itself to change, only the app's UI color
  system. Left as gold intentionally.
- **`src/lib/portfolio-personality.ts`**'s `ANIMAL_CARD_TONE` (an
  archetype color system with amber/yellow entries among ~10 other hues)
  — confirmed via `grep` that nothing in `src/` imports or renders this
  export. Dead code, not part of any of the six audited pages. Left
  untouched rather than editing an unreachable file for a pass whose
  point is fixing what's actually on screen.
