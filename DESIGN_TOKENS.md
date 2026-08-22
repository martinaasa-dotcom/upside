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
| Blue | `--ambient-cool` | The ambient page glow's bottom-right counter-lobe, and nothing else — see "Ambient counter-lobe" below. Deliberately not exported as a Tailwind utility, so there is no `bg-ambient-cool` to reach for. |

Four colors total, three of them semantic single-purpose (warning/gain/loss)
and one general brand accent (warm yellow) — plus one chrome-only value
(`--ambient-cool`) that lights a corner of the room and never touches a
component. Nothing else gets a new color
without adding a row here first.

### `--loss` chroma (corrected in Round 2)

`--loss` is `oklch(0.645 0.21 16.439)`, not `0.246`. At 0.246 this
hue/lightness sits outside sRGB and browsers clipped it to
`rgb(255,32,86)` — a channel-maxed red, far louder than `--gain`'s
in-gamut `rgb(0,188,125)`. Two colours meant to carry equal weight were
not reading as equals. 0.21 resolves to `rgb(242,67,95)`. `--chart-5`,
which shares the value, moved with it. If you ever change this, verify
in-gamut by rasterising to a canvas and checking no channel pins to 0 or
255 — `oklch()` will happily accept a value the display cannot show.

## Categorical data ramp (`--cat-1` … `--cat-10`, `--cat-neutral`)

The Accent Palette above is a ceiling for **decorative** colour. It is not
workable for **categorical data**: the allocation bar encodes eleven
themes side by side, and four colours cannot tell eleven things apart. So
this is the documented exception the Accent Palette's own rule asks for —
added here first, then used.

| Token | Value | Token | Value |
|---|---|---|---|
| `--cat-1` | `oklch(0.78 0.1 195)` | `--cat-6` | `oklch(0.62 0.11 195)` |
| `--cat-2` | `oklch(0.62 0.11 230)` | `--cat-7` | `oklch(0.78 0.1 340)` |
| `--cat-3` | `oklch(0.78 0.1 125)` | `--cat-8` | `oklch(0.62 0.1 125)` |
| `--cat-4` | `oklch(0.62 0.11 340)` | `--cat-9` | `oklch(0.78 0.09 230)` |
| `--cat-5` | `oklch(0.78 0.09 260)` | `--cat-10` | `oklch(0.62 0.11 260)` |
| `--cat-neutral` | `oklch(0.62 0 0)` | | |

Rules for this ramp:

1. **Five hues at two lightness steps, not ten hues at one.** Low chroma
   throughout (0.09-0.11, near `--primary`'s own 0.09) so it reads as one
   restrained family. Ten distinguishable *hues* is not actually available
   here: the banned violet arc (270-330) plus the four hues spoken for by
   semantic colours (loss 16, warning 45, primary 90, gain 162) leave well
   under 180 degrees of usable wheel, which would space ten hues about 14
   degrees apart — indistinguishable at this chroma. Splitting the
   lightness gets ten separable steps honestly.
2. **Every hue clears all four semantic hues by at least 18 degrees, and
   none falls in 270-330.** Keep both properties if you change a value.
   This was learned the hard way: an earlier all-one-lightness version put
   crypto on hue 90 and data-center power on hue 40, so on the Circle
   bestiary the Dragon card came out the same colour as the Fox card
   (`--primary`) and the Rhino card the same colour as the Shark card
   (`--warning`). The table before *that* (`#a78bfa`, `#e879f9`,
   `#818cf8`, `#f59e0b`, hardcoded hex, no tokens) is what had put the
   banned hues on screen in the first place, as the widest strip of colour
   in the product.
3. **Chart categories and archetype chrome only.** Never status, never
   anything a person reads as good/bad — `--gain`/`--loss`/`--warning` own
   that, and a category borrowing one of them makes both meaningless.

### Who consumes this ramp

Two tables, both in `src/lib/portfolio-personality.ts`, and they agree by
construction:

- **`THEME_COLOR`** — the Lab allocation bar and its legend, one step per
  `ForecastTheme`.
- **`ANIMAL_CARD_TONE`** — the Circle bestiary cards, the pill next to a
  member's name, the tile behind the emoji, and the milestone bar.

`ANIMAL_CARD_TONE` used to be 21 hand-picked Tailwind hues — one bespoke
palette per archetype, including all four banned ones plus a
`bg-{hue}-500/10` tinted card wash apiece. Twenty-one distinguishable hues
cannot be picked tastefully; the attempt is what produced the rainbow. It
is now 13 shared tones, because the archetypes are not 21 unrelated
things:

- **Ten of them are the theme animals.** Beaver *is* AI computer builders,
  Rhino *is* data-center power, Dragon *is* crypto. They point at the same
  `--cat-*` step their theme uses in `THEME_COLOR`, so a Beaver card and
  the matching slice of the allocation bar are the same colour without
  anyone having to keep them in sync by hand.
- **The other eleven describe temperament**, which is a real three-step
  axis rather than eleven arbitrary points: steady (`--cat-neutral`),
  balanced (`--primary`), and runs hot (`--warning` — a jumpy,
  concentrated book is a caution, which is exactly what that token means).

Colour there now carries information. Identity was never the job: every
archetype already ships an emoji and a name, which are far stronger cues
than hue.

**One constraint if you touch those class strings:** they are literal
Tailwind arbitrary values (`bg-[var(--cat-2)]`,
`bg-[color-mix(in_oklch,var(--cat-2),transparent_80%)]`). The JIT scans
source for literal strings, so building them from a template literal makes
the classes silently stop existing. Verify against the compiled bundle,
not the source.

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

Same pass added two shared utility classes in `globals.css`. **Values below
were re-measured from the running app in the Round 2 audit — the numbers
originally written here had drifted from the code:**

- **`.glass`** — `background-color: color-mix(in oklch, var(--card),
  transparent 38%)` plus `backdrop-filter: blur(28px) saturate(1.6)`. The
  standard fill for every top-level card/panel (`BOX`, `SCORE_CELL`,
  `SHELL_TONES`, `LIST`, `Reading`, the shadcn `Card` primitive, and the
  hand-rolled `bg-card ring-1 ring-foreground/10` pattern that recurred
  across ~13 files) — translucent instead of opaque so the ambient corner
  glow shows through, blurred, instead of stopping dead at the card edge.
- **`.glass-well`** — same idea for nested `bg-muted` wells: `transparent
  50%` and `backdrop-filter: blur(16px) saturate(1.4)`. It *does* carry
  its own blur (an earlier version of this doc said it didn't).

**Write the prefixed `-webkit-backdrop-filter` first and the standard
`backdrop-filter` last in both rules.** Authored the other way round, the
CSS transform collapsed the pair and emitted only the prefixed form; Blink
does not honour that alias, so `backdrop-filter` computed to `none` and
every glass surface in the app rendered as a flat translucent tint with no
blur on desktop Chrome, Edge and Android Chrome. It was invisible in
source and only showed up in the compiled bundle — check there, not here.
- **`.card-sheen`** changed from a `--card`-to-lighter-`--card` gradient
  to a white-to-transparent specular wash. The old version's stops were
  both opaque, so layering it over `.glass`'s translucent
  `background-color` would have fully re-opaqued the card (`background-
  image` paints over `background-color`) and silently cancelled the glass
  effect. The new version never references `--card` at all, so it composes
  with either an opaque or translucent base underneath.

The ambient glow itself (`.page-frame::before`) also got stronger, since
translucent cards dilute whatever glow sits behind them and the ask was
explicitly to see it through the cards, not just in the gutters between
them. **Current measured values: a 1250x1000px key lobe at 52% off the
top-left corner (`-4% -8%`), plus a faint 1300x1000px counter-lobe at 14%
bottom-right — both in `--primary`.** (This doc previously said
30%/22% at 1600/1400px, and described a second gain-green lobe — both
wrong; see "Gradient/glow pattern" below.)

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

Two large, heavily blurred radial shapes, **both in `--primary`**, shared
app-wide as `.page-frame::before` (`src/app/globals.css`).

**One colour only, on purpose.** Gain-green is a financial signal — it
means "this went up" — so it does not belong in ambient chrome that has
nothing to do with performance. The Round 2 audit found green still in two
places on the signed-out page (`bg-gain/10` at `blur(130px)`, and a
`to-gain/10` stop in the sample card's halo), measured as rgb(0,11,7) on
the right against rgb(37,34,21) warm on the left. That was the
"unexplained green glow" the design reviews kept flagging. Both are now
`--primary`.

## Explicitly out of scope for this pass

- **`src/lib/book-shock.ts`**'s `"gold"` sector key (GLD/IAU/SLV/GDX/GDXJ) —
  this is the literal commodity, a portfolio-classification label, not a
  color token. Untouched.
- **Email** — mail clients do not do `oklch`, custom properties, or
  `backdrop-filter`, so the Sunday letter carries its own hex palette in
  `EMAIL` (`src/lib/email-letter.ts`). That is a conversion of these tokens,
  not a second palette: `gold: "#d4bc79"` is `--primary`, `gain: "#00bc7d"`
  is `--gain`, and so on. Move a token here and re-convert rather than
  eyeballing a near-match. *(This entry used to say the templates held a
  stray `#d6ad69` and name a second file, src/lib/note-report.ts (unbackticked
  here because it is not a path you can open). Neither
  survives: the hex is gone from the repo, and that file went with the
  weekday and after-close notes on 2026-08-19.)*
- **The logo mark** (`/public/upside-mark.png`, referenced from
  `UpsideLogo.tsx`) — a static raster asset (also used as the favicon, OG
  image, and X profile image), not a CSS-token-driven element. Recoloring
  it is a graphic-design task outside a token/component pass, and nobody
  asked for the brand mark itself to change, only the app's UI color
  system. Left as gold intentionally.
- ~~**`src/lib/portfolio-personality.ts`**'s `ANIMAL_CARD_TONE` is dead
  code~~ — **no longer true, and it was the single worst colour offender
  found in the Round 2 audit.** Six modules import from this file
  (`LabSheet`, `CommunityView`, `UpsidePortfolioPage`, `TickerDrawer`,
  `allocation`, `book-insights`), and the power-animal work made the tone
  table live. It is a 21-hue rainbow — `bg-purple-400`, `bg-violet-400`,
  `bg-fuchsia-400`, `bg-indigo-400` among them — each with a
  `wash: "bg-<hue>-500/10"` tinted card background, which is the exact
  pattern `AGENTS.md` bans by name. Its sibling `THEME_COLOR` was fixed in
  Round 2 (see "Categorical data ramp" below); `ANIMAL_CARD_TONE` is
  **still open** and is tracked in
  `docs/audit/01-visual-cohesion-fix-log.md`.


## Why the glass is mostly *edge*, not blur (2026-08-20)

Turning the standard `backdrop-filter` back on (it had been silently
dropped from the compiled bundle — see above) produced **no visible
change**, which is worth writing down so nobody re-fixes it.

A blur can only reveal itself if the backdrop it samples has structure.
Measured behind a typical card, the ambient field varied by about **11
levels out of 255**, in a perfectly smooth radial ramp. Blurring a smooth
4% ramp is arithmetically indistinguishable from not blurring it. The
glass was working; there was nothing behind it to refract.

So on a true-black field, what actually reads as glass is, in order:

1. **The specular edge.** A bright hairline along the top where a pane
   catches the light, and a much fainter one along the bottom where light
   wraps under it. This is the strongest cue by a wide margin.
2. **A room with real dynamic range.** The key lobe was tightened and
   roughly doubled (measured page-wide spread **33 → 68** of 255), so the
   light actually ramps across a row of cards and each pane picks up the
   part of the light it sits in.
3. **The blur itself** — which mostly matters where a card overlaps other
   content rather than empty field.

Two things were tried and measured *worse*, so don't reach for them:

- **A second strong lobe** (top-right). It lit both sides evenly and
  flattened the left-to-right difference between cards from 13 to 5 —
  i.e. it made every card look the same, which is the opposite of the
  goal. One key light plus a faint counter-lobe is the composition.
- **More transparency alone.** On a flat field, a more transparent card
  is just a darker card; it does not become glassier. Transparency only
  pays off once the field behind it has something to show (point 2).

When judging a change here, measure rather than eyeball: page-wide field
spread, the left-vs-right difference between two cards in the same row,
and the top-edge lift in luminance levels.

## Dim text on a primary fill: name the fill, never a variant (2026-08-21)

`text-muted-foreground` is a grey tuned for the black field. Dropped
inside a filled `--primary` pill — a selected tab, an active chip — it
becomes mid-grey on light yellow, which is roughly invisible. That is what
happened to the count in "All portfolios 3", and `globals.css` has carried
a rule since then that re-resolves such text against
`--primary-foreground` so it stays a step quieter than the label beside it
without vanishing.

That rule shipped with two selectors:

```css
.bg-primary .text-muted-foreground,
[data-variant="default"] .text-muted-foreground { … }
```

The second one is the bug. `data-variant="default"` is not a primary fill
— it is the *default variant* of nine separate shadcn primitives, each of
which emits the attribute unconditionally: `Item`, `ItemMedia`, `Empty`,
`Field`, `Badge`, `Button`, `TabsList`, `ToggleGroup`, `DropdownMenuItem`.
Only `Badge` and `Button` actually paint `--primary` when default, and
both already carry a literal `bg-primary` class, so the first selector had
them covered. The other seven paint nothing, `bg-muted`, or the card — so
every piece of secondary text inside any of them resolved to
`--primary-foreground` (`oklch(0.145 0 0)`, near-black) at 65% alpha and
disappeared into the black field.

Measured in Chromium against the compiled bundle, before and after:

| Element | Before | After |
|---|---|---|
| Leaderboard rank number (inside `ItemMedia`) | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| "(you)" tag (inside `ItemTitle`) | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| `DropdownMenuShortcut` | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| `Empty` state copy | `oklch(0.145 0 0 / 0.65)` | `oklch(0.708 0 0)` |
| Count inside a default `Badge` | `oklch(0.145 0 0 / 0.65)` | `oklch(0.145 0 0 / 0.65)` |

The last row is the case the rule exists for, and it is unchanged. The
first four are 21 files' worth of collateral — the community leaderboard,
Account, the holding modal, Pulse, Forecast, the watchlist strip, the
ticker drawer, snapshots, invites, onboarding, and the rest.

**Rule: this selector may only ever name a fill.** If a future call site
paints `--primary` some other way (a `data-active:bg-primary` variant, an
inline style), give that element the plain `bg-primary` class too rather
than widening the selector back out to a variant name.

### Same pass: the leaderboard medals

Rank 3 in the community "Today" list was drawing its medal in
`text-caution` — i.e. `--warning`, the true orange this file reserves for
"caution/warning states only … don't reach for it decoratively." A
leaderboard row is not an alert, and third place lit up louder than first.
Gold/silver/bronze is not a palette this app has, so the three medals are
now one accent stepping down in strength — `text-primary`,
`text-primary/65`, `text-primary/40` — which reads as rank without
borrowing a semantic colour. (Rank 2's medal was previously
`text-muted-foreground`, so it was also a casualty of the selector bug
above and rendered near-black.)


## Ambient counter-lobe (`--ambient-cool`, 2026-08-21)

The `.page-frame` glow was one warm colour: a `--primary` key light off the
top-left at 52%, and a `--primary` counter-lobe off the bottom-right at 14%,
both sized in fixed pixels. Martin asked for the bottom-right to carry a
different, complementary hue, and for the whole thing to stay subtle — a
diagonal warm-to-cool read with genuine black in between, on phones as well
as desktops.

### The hue

`--ambient-cool: oklch(0.72 0.13 250)` — blue.

**Why 250 and not a teal.** Hue 250 is 160° from `--primary`'s 90 — all but the
last twenty degrees of the opponent contrast available. That matters for a
reason beyond arithmetic: colour leaves the retina encoded on two opponent
channels, and blue–yellow is one of them, so this pair is opposite *in the
visual system* rather than merely on a diagram. It is the most contrast the
eye can register per unit of colour spent, which is exactly what a wash this
faint needs.

It also clears every hue this palette has already spent — 88° from `--gain`
(162), 205° from `--warning` (45), 234° from `--loss` (16). **That margin is
the point, not a bonus.** The first version of this was a teal at hue 200,
picked while a blanket ban on violet stopped the search short of the
complement. Teal sits 38° from the emerald that means a position went up,
which is the one collision a money app cannot afford. The ban was lifted on
2026-08-21 and the hue moved with it.

Lightness 0.72 / chroma 0.13 is where hue 250 stays in sRGB with headroom.
Verified in-gamut by rasterising to a canvas: `rgb(96,170,243)`, no channel
pinned at 0 or 255.

**The two lobe alphas differ on purpose** — 28% warm, 31% cool. sRGB is not
symmetrical: its blue primary carries roughly a fourteenth of the luminance
of its green, so the cool side has far less headroom at a given lightness.
The two lobes are matched by *measurement*, not by being written the same
number. Measured bottom-right luminance is 33.8 against the warm lobe's
neighbourhood, and the old teal needed only 25% for the same result.
**Changing the cool hue means re-solving this alpha**, or the corner silently
gets brighter or dimmer than the one opposite it.

Alternatives considered, all rendered in the real stylesheet and matched to
the same measured brightness before comparing — which matters, because an
equal-alpha lineup flatters warm hues for gamut reasons that have nothing to
do with the choice:

| Hue | OKLCH | Alpha to match | ° from gold | ° from gain | Verdict |
|---|---|---|---|---|---|
| Teal 200 | `0.78 0.10 200` | 27% | 110 | **38** | Prettiest at the least alpha; too near `--gain` |
| Cyan 220 | `0.80 0.11 220` | 27% | 130 | 58 | Holds up best in a dark room (nearest the rod peak) |
| **Blue 250** | `0.72 0.13 250` | **31%** | **160** | **88** | **Chosen** |
| Violet 270 | `0.66 0.15 270` | 36% | 180 | 108 | The literal complement; reads purple, needs the most alpha |
| Indigo 285 | `0.64 0.16 285` | 37% | 165 | 123 | Starts reading as a brand colour rather than as light |
| Orchid 310 | `0.68 0.16 310` | 35% | 140 | 148 | Furthest from every semantic hue, and the most dated |

Violet at 270 is the literal opposite and remains defensible; 250 was taken
because it keeps nearly all of that contrast while staying on the blue side
of purple, needs less alpha to be felt, and reads as night and distance
rather than as a colour someone picked.

### The geometry: small corner lobes, sized in viewport units

Key light `95vw 58vh at -6% -8%`; counter-lobe `95vw 58vh at 106% 108%`. Each
falls through three stops — 28% → 12% → 4% → transparent for the warm one,
25% → 11% → 4% → transparent for the teal.

Three things are load-bearing here, and all three are measurable.

**The black between them is the design.** It is what separates the two lights
and keeps them reading as corners of a dark room rather than as a tint laid
over the page. About three quarters of the field measures under 2/255.

**`vw`/`vh`, not `px` — this is the mobile fix.** At a fixed 1250×1000 the
lobe was wider than a phone, so both lights flooded the screen and stacked
into horizontal bands. On a 390×844 viewport the *old* key light left the
top-right corner at 58/255 and the page middle at 29/255: no black anywhere,
and no diagonal. Sizing against the viewport holds the same proportion at
every width, so the corner-to-corner read survives on a phone. The test for
"is it diagonal" is the other two corners — top-right and bottom-left must
both measure 0.

**Anchored just off-screen.** At `-6% -8%` and `106% 108%` the brightest point
of each lobe sits outside the frame and only its falloff is visible. Anchored
exactly on the corner, the hottest pixel is in frame and reads as a lamp
rather than as spill.

**Three stops, not two.** A single colour-to-transparent ramp has a visible
edge — the lobe reads as a shape sitting on the page rather than as light.
Spending most of the falloff in the very dim end (28 → 12 → 4 → 0) thins the
light into the black with no boundary anywhere. Peaks and black area measure
the same either way, so this buys nothing but the look, which is the point.

Measured in headless Chromium against the compiled stylesheet, at 1440×900
with a three-card row and at 390×844 with a single column:

| | Original | Overshoot | Now |
|---|---|---|---|
| Top-left peak | 94 | 111 | **40** |
| Bottom-right peak | 28 (warm) | 68 | **34** (blue, by luminance) |
| Top-right / bottom-left, desktop | 0 / 0 | 7 / 0 | **0 / 0** |
| Top-right / bottom-left, **phone** | 58 / 17 | 88 / 53 | **0 / 0** |
| Page middle, phone | 28.9 | 74.1 | **0** |
| Field under 2/255, desktop | 36.4% | 0.6% | **68.3%** |

The "Overshoot" column is a real pass that shipped to a preview and was wrong:
1700px lobes at 60%/34%, chasing coverage on the theory that an unlit corner
gives the glass nothing to refract. It lit 99% of the field and left no black
at all, which is the opposite of the brief. Recorded here because brightening
this is the easy mistake and the metric that catches it is the share of field
under 2/255, not how good a single screenshot looks.

Verified at 1440x900, 1280x800, 834x1112 and 390x844: the peaks hold at 40 /
34-36, the opposite corners stay at 0, the middle stays at 0, and the black
share stays 66-68% at every one. That consistency is the whole reason for
sizing in viewport units.

Contrast was re-checked after dimming, since ambient light sits behind text:
muted text on glass in the hottest corner measures 8.19-8.81 across those
sizes -- better than the 7.92 this had originally, and well clear of AAA.


## Two typefaces, split by job (2026-08-21)

`--font-sans`, `--font-heading` and `--font-logo` all pointed at Geist, which
made the three tokens decorative — the `font-heading` utility was on about
twenty call sites and did nothing. They now divide real work:

| Token | Face | Carries |
|---|---|---|
| `--font-sans` | Geist | Every sentence. Unchanged. |
| `--font-mono` | Geist Mono | Every figure, percentage and share count. Unchanged. |
| `--font-heading` | **Archivo** | Headings, panel titles, ticker cells. |
| `--font-logo` | **Archivo** | The wordmark. |

**Why Archivo.** `font-heading` lands anywhere from a 14px ticker cell to a
24px hero, so a face with display-only proportions would fall apart at the
small end; Archivo is a grotesque built to hold across sizes. Against Geist's
rounder, wider neo-grotesque it reads tighter and more set — enough
separation to be a pair, not enough to look like two unrelated fonts on one
page. Loaded through `next/font`, which registers it under its real family
name and generates `Archivo Fallback` with metric overrides, so the swap
costs no layout shift. Verified against `document.fonts` in the running app
rather than assumed.

**One latent bug fixed with it.** The `h1…h4` element rule named
`--font-sans` while every deliberate heading call site used the
`font-heading` utility. With both tokens on Geist nothing gave the mismatch
away; a bare `<h2>` and a `<h2 class="font-heading">` would have rendered in
different faces the moment they diverged. The element rule now names
`--font-heading`.

**Tracking is a scale, not a constant.** It was a flat `-0.025em` at every
level. Letterfit is optical — the spacing that reads right at 14px reads
loose at 24px, because tracking is a fraction of the em and the gaps grow
with the type. Now `-0.035em` at h1, `-0.028em` at h2, `-0.02em` below, with
`PanelHeader` matching at its two sizes. `text-wrap: balance` on headings
stops a two-line title leaving one orphan word on the second line.

**What was tried and dropped.** A mono uppercase eyebrow label above panel
titles (`TODAY · CIRCLE`) was built and then removed. It looked good, but
every candidate placement repeated what the heading or the dock already
said — the Pulse panel sits on a page the dock labels "Pulse", and the
Compound results sit beside a panel titled "Growth calculator". Structure
should encode something true about the content; this encoded nothing, so it
was decoration. Worth revisiting only if a surface appears where a reader
landing mid-page genuinely cannot tell what section they are in.


## Reach, and the chrome that was eating it (2026-08-21)

Two separate complaints, one symptom: the glow felt boxed into a band in the
middle of the page.

### The chrome was clipping the field

`.page-frame::before` is `position: fixed; inset: 0`, so it always spanned the
whole viewport. What cut it was the chrome painted on top:

| Surface | Was | This pass | Today |
|---|---|---|---|
| Desktop header | `bg-background/75` | `bg-background/55` | `bg-background/35` |
| Status strip | `bg-background/75` | `bg-background/55` | *(merged into the header — see "One pane" below)* |
| **Desktop dock** (`PortfolioTabs`) | **`bg-background/95`** | `bg-background/60` | `bg-background/35` |
| Mobile top bar | `bg-background/75` | `bg-background/55` | `bg-background/35` |
| Mobile tab bar | `bg-background/75` | `bg-background/60` | `bg-background/35` |

The fourth column is where these actually sit now, two passes later. The
numbers in the third are kept because the reasoning below is about *that*
step; the values it names stopped being current the same day.

`--background` is pure black, so each of these is a black veil and its alpha
is *exactly* how much of the light underneath it eats. At `/95` the dock was
effectively opaque. Both bands sit over the brightest parts of the field —
the warm corner at the top, the blue at the bottom — so that is precisely
where the clipping showed. Measured on the running app, the luminance step
across the header edge went from a hard bar to **7.1**, and across the dock
edge to **2.9**.

The blur carries legibility here, not the opacity: `backdrop-blur-xl` turns
anything scrolling under into a soft wash, and the field it sits on peaks at
40/255 at the time (43 today — see "Chrome: one pane" below). Header text
measures **18.5** contrast against it. Don't raise these back toward opaque to
"fix" contrast without measuring first.

### The lobes got reach, not brightness

Peak alpha did not move — 28% warm, 31% cool, same as before. Only the radii
and the tail did: `95vw 58vh` → `130vw 82vh`, with a fourth stop added to
each lobe (28 → 13 → 5.5 → 2 → 0) so the extra distance is spent almost
entirely in the very dim end.

| | Before | After |
|---|---|---|
| Lit field (≥ 4/255) | 27.2% | **48.1%** |
| Field under 2/255 | 68.1% | **32.6%** |
| Top-left / bottom-right peak | 40 / 52 | 43 / 55 |
| The two opposite corners | 0 / 0 | 1 / 2 |
| Muted text on glass | 8.19 | 7.84 |

Lit area nearly doubles, the corners are within a couple of levels of where
they were, a third of the page is still true black, and the diagonal still
reads — the dark corners sit at 1–2 against the lit pair's 43 and 55.

**Brightness and coverage are separate dials, and they fail the same way.**
The earlier overshoot pushed *alpha* (60%/34%) and lit 99% of the field. One
more size step here — `145vw × 92vh` — takes the black share from 33% to
1.8%. Same failure, other route. Whichever dial moves, the number that
catches it is the share of field under 2/255.


## Label voice: mono caps, two tiers (2026-08-21)

Taken from the counter-lobe study page, which Martin asked to have applied to
the app. Two label tiers there, and the app already had surfaces for both.

**Tier one — scaffolding.** `MicroLabel`, and now every table column header.
Mono, uppercase, 11–12px, `tracking-[0.1em]`, `--muted-foreground`.

These were sentence-case sans at the same size and weight as the muted prose
beside them, so a label read as another line of copy rather than as the
structure it is. Column headers were worse: `text-foreground`, which made the
header row the loudest row in the table — the one row a reader never needs to
look at twice. Mono caps inverts that. The eye skips it when reading down a
column and finds it when scanning for one.

Tracking is `0.1em` because caps set at a face's normal tracking close up:
letterfit is drawn for mixed case, and caps have no descenders or ascenders to
open the rhythm.

Deliberately muted, not accent. This lands on eight-plus components including
four abreast in the dashboard figure row and every table header in the app;
an accent on all of them would spend the one brand colour on scaffolding.

**Tier two — annotation.** `NoteRows`, in `--primary`.

A short label in the gutter and the prose it introduces, in a
`7rem / 1fr` grid that collapses to one column on a phone. This is the tier
that gets the accent, because here the label does real work: it tells one
paragraph from another.

The first call site is the Pulse card, which stacked four paragraphs that mean
different things — Margus's reasoning, the reader's own note, an earnings
date, and the condition that would change the verdict — as four identical
grey blocks. One of them, `thesisBreak`, was already trying to label itself by
opening with the words "Breaks if". That is now the label.

`NoteRows` refuses to render as a list below two rows, and falls back to a
plain paragraph: a single labelled row is a label with nothing to distinguish
itself from. Labels are plain language — "BREAKS IF", never "INVALIDATION".


## Glass pass: one pane, deeper refraction, wider field (2026-08-21)

Four reports, from a signed-in screenshot.

### "Two weird layers of glass, it's not one smooth unit"

The header row and the status strip were two sibling `fixed` elements, each
with its own `bg-background/*` fill and its own `backdrop-blur`. Two blurs on
two backdrops do not read as one sheet: each samples a different slice of what
is behind it, so the bands came out at visibly different tones with a seam
between them.

Fixed structurally rather than tonally — one wrapper, one fill, one blur, both
rows inside it, a hairline where they meet. Verified on the running app: the
top chrome is now a single `div top=0 backdrop-filter: blur(40px)`, 85px
tall (it was 98px before the rows were tightened; see "One pane" below).

Still **one** `<AppStatusStrip>` instance. It holds a one-second interval and a
visibilitychange listener, so rendering it once per breakpoint would run two of
each; the single wrapper changes behaviour at `md` instead.

### "The yellow glow on the footer is terrible"

Not a glow. It was the Margus button.

`CcAdvisorChat`'s FAB carried `lg:bottom-8`, a flat 2rem offset, while the dock
is `fixed inset-x-0 bottom-0` at every width. So on desktop the button sat
*underneath* the dock. Two consequences, both hidden while the dock was
near-opaque and both exposed the moment it became translucent:

1. The dock's backdrop blur (24px then, 40px now) sampled the button's warm
   fill and smeared it
   across the corner as a soft yellow haze.
2. Clicks in that corner hit the dock. **Margus was unreachable on desktop.**

`--dock-pad` is the live measured dock height and the non-`lg` branch was
already using it, so the fix is to drop the override. The consent banner needed
the same clearance — it anchors to `--dock-pad` too and was landing on the
button once the button moved up.

### "Increase the glassiness … refract like Apple's new glass"

| | Was | Now |
|---|---|---|
| `.glass` fill | `transparent 38%` | `transparent 55%` |
| `.glass` blur / saturate | `28px` / `1.6` | `40px` / `1.9` |
| `.glass` top rim | white @ 24% | white @ 30% |
| `.glass-well` fill | `transparent 50%` | `transparent 64%` |
| `.glass-well` blur / saturate | `16px` / `1.4` | `24px` / `1.7` |
| Chrome veils | `/55`–`/60`, `blur-xl` | `/50`, `blur-2xl` — and `/35` a pass later |

More of the field passes through, and the heavier blur plus saturation lift is
what makes it refract rather than just tint.

Contrast re-measured on the running app afterwards, because a more transparent
card means text sits closer to the light: muted on card **7.3–8.39**, foreground
on card **16.8**, foreground on the header **18.6**. On a phone the bar's own
glass over the brightest part of the field measures `rgb(19,17,11)` — foreground
**18.2**, muted **9.1**. All far above AAA.

*(Measuring that last one needs the bar's own children hidden first. Every point
in the mobile bar is covered by some child's box, so a naive pixel scan returns
the gold logo mark — a deliberate brand element, not a background — and reports
a false 3.66.)*

### "The background glow could cover an even bigger area"

`130vw 82vh` → `150vw 96vh`, with a fifth tail stop. Peak alpha unchanged for
the third widening running: 28% warm, 31% cool.

| | Before | After |
|---|---|---|
| Lit field (≥ 4/255) | 43.9% | **60.1%** |
| Corner peaks | 40 / 51 | 40 / 51 |
| The two opposite corners | 1 / 2 | 3 / 3 |
| Page middle | 2.1 | 5.7 |

The middle at ~6/255 is *spread*, not lit — it still reads black against 40 and
51 in the corners, and the opposite corners at 3 keep the diagonal. The share
under 2/255 drops to 6.7%, which is why that metric alone stops being the whole
story at this reach; read it together with the middle and the corner spread.

One further step (`165vw × 108vh`) puts the middle at 7.6 and lit at 91.5%, and
that is the wall.

*(It was not the wall. The next pass went to `170vw × 112vh` — see below.)*

## Chrome: one pane, and the field's current numbers (2026-08-21)

Three follow-ups, plus a re-measurement that supersedes every figure above.

### The hairline survived the merge

Merging the header row and the status strip into one wrapper fixed the *fills*,
but `border-b` stayed on the header element, so a rule still ran between the two
rows and the chrome still read as two stacked panes — which was the original
complaint. The only edge the chrome carries now is the one at its bottom, where
it meets the page.

Walking the band top to bottom at a text-free column, luminance goes `15.0 →
12.9` with a biggest single-pixel step of **0.93/255**. No seam, no banding; the
gentle falloff is the field itself getting darker downward.

### Veils to `/35`, rows tighter

All four chrome veils went `/50` → `/35` with `backdrop-blur-2xl`. Desktop
chrome tightened from 96px to 84px of rows — header `3.5rem → 3rem`, status
`2.5rem → 2.25rem` — because at the old heights the markets bar sat a clear step
below the header rather than reading as its second line.

**The spacer that reserves it is 85px, not 84.** The status strip carries a
`border-b`, and the hairline is part of the chrome's height whether or not
anyone counts it; at a flat `h-21` the page's top pixel row sat under that edge.
`PAGE_CHROME_SPACER_CLASS` is now written as `calc(5.25rem_+_1px)` so the
arithmetic is visible — and written out literally rather than composed from a
constant, because Tailwind extracts classes by scanning source text and a
template literal yields a class that never gets a rule.

### The field, re-measured

`150vw 96vh` → `170vw 112vh`, a fifth tail stop, peak alpha unchanged for the
fourth widening running: 28% warm, 31% cool.

Everything in the sections above was sampled with page content on screen. These
were taken with the field alone — the frame's children and the chrome hidden —
and with the scrollbar gutter down the right edge excluded, because that gutter
is compositor paint rather than field and sampling it reports a false black
corner. That is why these differ by a point or two from the numbers above; where
they disagree, **these are the ones to trust.**

| | Desktop 1440×900 | Phone 390×844 |
|---|---|---|
| Top-left peak (warm) | `rgb(43,38,24)` → **43** | `rgb(43,38,24)` → **43** |
| Bottom-right peak (blue) | `rgb(22,38,55)` → **55** | `rgb(22,38,55)` → **55** |
| Top-right / bottom-left | 5 / 6 | 5 / 6 |
| Page middle | **7** | **9** |
| Lit field (≥ 4/255) | 99.9% | 99.8% |
| Field under 2/255 | 0.1% | 0.2% |

The corners come out identical at both sizes, which is the check that sizing the
lobes in `vw`/`vh` is doing its job.

**The black-share metric is finished.** It was the guard that kept this honest
through three widenings, and at this reach it reads 0.1% while the page still
looks like a dark room. What carries that read now is the middle at 7 against
lit corners at 43 and 55, with the two opposite corners at 5 and 6 holding the
diagonal. Judge it on those three; brightness and coverage stay separate dials,
and the failure mode is still *alpha* — 60%/34% once put the middle at 32 and
the corners at 111.

## The dock: one well, one cell per place (2026-08-21)

> *"in a way that doesnt assume that someone could have 6 sheets, usually
> they have 1, what if the whole bottom bar wasnt built around adding new
> sheets and became more uniform?"*

The desktop dock was two controls sharing a bar. On the left, a fixed
`42rem` well of app sections — icon-and-label chips in a rounded group. On
the right, taking every remaining pixel, a heading reading **Sheets** over a
scrolling text rail of portfolio tabs, each with a 2px underline indicator,
an inline name field for creating one, and a `+ New` button.

Nothing about the two halves matched: different heights (48 vs 44), different
shapes (filled group vs bare rail), different active indicators (a filled
chip vs an underline), and a section label printed into the chrome that no
other control needed. And the split was sized for a case that almost never
happens. Measured on the running app at 1440px with an empty book:

| | Before | After |
|---|---|---|
| Dock height | 95px | **73px** |
| `--dock-pad` (page bottom clearance) | 127px | **105px** |
| Wells in the bar | 2 (672px + 464px, plus a 16px gap = the whole 1152px column) | **1 (640px)** |
| Width reserved for sheets, with zero sheets | **464px** (40% of the column) | **0** |

Now every destination is the same cell in the same well: the sections, then
one cell per portfolio, then Circle. One portfolio costs one cell. No
portfolios cost nothing.

### What each piece is doing

**Cells are `7.5rem`, and the well is `w-fit`, centred.** Sizing the row to
the full page column instead stretched five cells across 1152px, which left
each label floating in the middle of a 230px chip and turned the active one
into a slab of accent the width of a paragraph. Content-sized and centred,
the dock grows by exactly one cell when you add a portfolio.

**Sheets carry a dot where sections carry a glyph.** Same 16px slot, so the
cells stay structurally identical, but a row of five identical wallet icons
would have been noise. The dot is the sheet's direction today — emerald
`--gain`, rose `--loss`, `currentColor` at 40% when there is no quote yet —
so the slot pays for itself.

**Section labels are the phone's, not the desktop's.** Home, Pulse, Lab,
Growth, Circle. Spelling out "Overview" and "Compound" cost ~30px a cell for
no added meaning — the page header already names where you are — and it is
what pushed a four-sheet row into truncating on a small laptop.

**`+` is a 2.5rem glyph cell, sitting with the sheets it makes**, second to
last so Circle keeps the end. That replaces a labelled button *and* the
"Sheets" heading *and* the inline name field: it now opens the same New
portfolio dialog the phone has always opened.

**The well is `.glass-well`, not `bg-muted`.** The dock sits over the
brightest part of the ambient field, and an opaque fill there was a hole
punched in the glow. Measured on the running app the well surface reads
`rgb(18,21,25)` — the blue lobe showing through — with foreground text at
**17.54** and muted at **7.09**, both above AAA. The mobile bar's well moved
to `.glass-well` with it, so both docks are the same material.

### Folding, and why it is measured rather than guessed

Two different things run out, and not at the same width:

- **Count.** Past `MAX_DOCK_CELLS` (9) the row outgrows the page column.
- **Width.** A row can fit the count and still squeeze every cell too narrow
  to read — 10 cells inside a 768px column is 74px each, and `Growth`
  truncates to `Grow…`.

So `dockFoldsSheets` (`src/lib/dock-cells.ts`) takes both, and the row
measures its own container with a `ResizeObserver` rather than reading a
breakpoint — what decides the fit is the column's width, which is the same
number at 1024px with a wide gutter as at 900px with a narrow one. Past
either limit the portfolios fold into one cell that opens a list, with
**New portfolio** at its foot.

Verified across viewports, with truncation checked per cell rather than by
eye (`scrollWidth > clientWidth`):

| Viewport | 1 sheet | 4 sheets | 6 sheets |
|---|---|---|---|
| 768 | inline, 111px | **folded** | folded |
| 900 | inline, 120px | **folded** | folded |
| 1024 | inline, 120px | inline, 102px | folded |
| 1280+ | inline, 120px | inline, 120px | folded |

No section label truncates at any width in that table. `MIN_CELL_PX` (96) is
what guarantees it: `Growth` is the longest section label and measures ~90px
with its glyph, the 6px gap, and `px-2` either side.

**Before lowering `MAX_DOCK_CELLS` to make something fit, check it against a
real book.** The seed household has four portfolios, so a cap of 8 would
fold the dock for the person who asked for this.
