# Upside Lab — Design Compliance Audit (verification pass)

Run date: 2026-08-18. Branch: `claude/new-session-6h7gac`, HEAD at commit
`97ef169` ("Design unification pass: cohesion, hover states, sizing, Pulse
actions, Pro upgrade entry point (#26)"), on top of `0fe25c7` ("design: dial
back to minimal/Apple-style glass, fix range-meter direction").

**Read this before the findings below**: those two commits already land on
this branch and their messages describe fixes for almost every Round 2 item
in the audit brief (translucency, card-sheen gradient, header opacity, the
green glow, the button glow, the range-meter direction, the chart Y-axis
fade). This report verifies those claims against the actual source and
whatever live rendering this sandbox could produce — it does not assume the
commit messages are true. Several items check out; a few do not, or check
out only partially. Those are called out explicitly below rather than
folded into a blanket "resolved."

## 0. Environment limitation (read this first — it shapes what's falsifiable below)

This sandbox has **no outbound network access** to market-data providers
(Yahoo/Twelve Data/Finnhub all time out — confirmed via direct `curl`), and
**no Supabase project configured** (`.env.local` absent). Consequences:

- The app runs in anonymous local-demo mode; every route (including
  `/login`) redirects straight into the dashboard rather than showing
  `SignInGate.tsx` — the actual marketing/sign-in page could **not** be
  screenshotted live. Round 1 item 1 (gradient-text contrast) and the CTA
  glow on that page (see Critical finding below) are verified from source,
  not a live render.
- Pasting holdings (`NBIS 500 109.96`, etc., the canonical Aasad demo book
  per `AGENTS.md`) parses correctly (`parseHoldingsPaste`, verified by
  reading `src/lib/csv-import.ts`) but quotes never arrive, so Overview,
  Pulse, Lab, and the Movers panel render in their **empty/"waiting on
  prices"** states, not populated. The Movers deep-dive (Section 3) is
  therefore a source-code trace, not a populated-state screenshot.
- The Compound calculator needs no market data and rendered fully — it's
  the one page audited from a real, populated, live screenshot end to end,
  and it's where the report's one new (non-Section-2) color-misuse finding
  came from.
- A small circular "N" badge with a number visible bottom-left in every
  screenshot is the **Next.js dev-tools indicator** (a framework overlay,
  not app markup) — confirmed by grepping the codebase for any component
  that renders it (none exists). Excluded from findings; it will not
  appear in production.

Ground truth used: `DESIGN_TOKENS.md` (Pass 2, current), `AGENTS.md`'s
design-rule section, and the corrected Accent Palette (warm yellow
`--primary: oklch(0.8 0.09 90)`, orange `--warning`/`--chart-3: oklch(0.63
0.22 45)`, emerald `--gain`, rose `--loss`/`--destructive` — four colors,
three semantic + one brand accent). Apple-glass definition per the brief:
real `backdrop-blur` + partial-alpha background, content legible-but-soft
behind it, no heavy colored halo.

---

## 1. Section 2 regression table

| # | Round | Item | Status | Evidence |
|---|---|---|---|---|
| 1 | R1 | Hero numeric text gray-on-gray gradient, hard to read | **Resolved** (source-verified) | `SignInGate.tsx:147` — `bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent`. Both stops are light-on-black (`--foreground: oklch(0.985 0 0)` full and at 70% alpha), not gray-on-gray. Could not screenshot live (see §0). |
| 2 | R1 | Floating unstyled text on Overview, no heading/container | **Not reproduced** | Reviewed live Overview, Pulse, Lab, Compound screenshots (`/audit-current/*.png`) — every text block sits inside a `Panel`/`PanelHeader`/`Reading`. No orphaned text found in what's renderable in this sandbox. |
| 3 | R1 | Accent color: purple/violet → white/subtle yellow | **Resolved** | `globals.css:20` — `--primary: oklch(0.8 0.09 90)`, hex-equivalent `#d4bc79` (computed). `grep -rn "purple\|violet"` across `src/` returns only: a stale doc comment (`Panel.tsx:57`), a dead `iconTone: "violet"` variant key that maps to neutral `bg-muted text-foreground` and has zero call sites (`Panel.tsx:219,227`), and a historical comment in `globals.css:19`. No live purple pixel anywhere. See Minor findings for the dead-code cleanup. |
| 4 | R1 | Button gradients flat/dated gray-to-lighter-gray | **Resolved, but by a different route than asked** | `button.tsx:12-13` — default variant is now `bg-primary text-primary-foreground shadow-xs hover:bg-[color-mix(in_oklch,var(--primary),white_10%)]`. No gradient at all (the commit `0fe25c7` deliberately dropped the 3-stop gradient in favor of a flat shadcn-style fill). This isn't "richer/darker gradient stops" as R1 literally asked for — it's "no gradient, flat brand-color fill, minimal hover shift." Judged against Section 1.5's Apple-glass-plus-shadcn direction this is a defensible, even preferable, choice — flagged in the designer critique (§4) as a judgment call worth confirming with Martin rather than a compliance failure. |
| 5 | R1 | Background gradient barely visible / opaque surfaces | Superseded — folds into #7/#8/#13 below, all checked there. |
| 6 | R1 | "Modern but old and ugly" tension | See Executive Verdict, §2. |
| 7 | R2 | Zero translucency on cards/panels/header | **Partially Fixed** | `.glass` (`globals.css:226-230`) is real: `background-color: color-mix(in oklch, var(--card), transparent 40%)` + `backdrop-filter: blur(24px)`, correctly `@layer utilities`-scoped so `hover:` variants aren't silently defeated (this was itself a bug fixed in `97ef169`). Applied to `Panel`/`MoverTile`/`DriverTile`/`PortfolioLane`, and the header (`AppHeader.tsx:78,118` — `bg-background/75 backdrop-blur-xl`). **But the sweep was not exhaustive**: `WatchlistStrip.tsx`'s `WatchCard` (both the loading and populated states, lines ~123 and ~154) and `DailyDuelCard.tsx:190,284` still use the exact pre-fix opaque pattern — `bg-card` / `bg-card ring-1 ring-foreground/10` — which `DESIGN_TOKENS.md` itself names as "the hand-rolled pattern that recurred across ~13 files" and says was replaced. These two are still on the old pattern. Check each surface individually, per the brief's own instruction — these are Critical, not "mostly done." |
| 8 | R2 | Card-sheen renders as visible gray-to-gray vertical gradient | **Resolved** | `globals.css:214-216` — `.card-sheen` is now `box-shadow: inset 0 1px 0 0 color-mix(in oklch, white, transparent 88%)`, a hairline top highlight, not a `background-image`/`linear-gradient`. `grep -rn "bg-gradient-to-b"` across `src/components` returns no card-background hits (the only `bg-gradient-to-*` usages left are the legitimate chart Y-axis fade masks and the sign-in headline, both audited separately). |
| 9 | R2 | Movers left-accent-bar rendering artifact | **Resolved (source-verified only)** | `MoverTile` (`OverviewDashboard.tsx:526-586`) and `DriverTile` (`:300-358`): the accent bar is `absolute inset-y-0 left-0 w-1 bg-gain`/`bg-loss` — a flat color, no gradient — inside a parent with both `rounded-lg` and `overflow-hidden`, so the bar cannot render past the rounded corner. No structural cause for a corner mismatch or glow bleed remains in the code. Could not confirm with a populated-data screenshot (see §0); see the Movers deep-dive (§3) for the full trace. |
| 10 | R2 | Primary CTA glow overdone (large/saturated/blurry) | **Partially Fixed — one CTA fixed, another still has it** | The in-app default `Button` (used by "Add a holding" etc.) dropped its glow entirely (`button.tsx:12-13`, just `shadow-xs`). But `SignInGate.tsx:187` — the "Continue with Google" button, the landing page's actual primary CTA — still has `shadow-[0_18px_40px_-16px_var(--primary)]`: an 18px vertical offset, 40px blur, full-strength primary-colored halo. This is precisely the pattern the item describes, on the single most prominent button in the app. Critical, still present. |
| 11 | R2 | Movers named as the worst-regressing component | See dedicated deep-dive, §3. |
| 12 | R2 | Watchlist range-meter knob color logic inverted | **Resolved, verified by tracing the math** | `WatchlistStrip.tsx:60-97`. `pos = (price - low) / span` (0 at low, 1 at high). Color: `color-mix(in oklch, var(--gain) ${pos*100}%, var(--loss) ${(1-pos)*100}%)`. At `pos=1` (price at high) → 100% gain-green. At `pos=0` (price at low) → 100% loss-rose. High→green, low→red, both directions correct. |
| 13 | R2 | Ambient glow hard-clipped at header | **Resolved** | `AppHeader.tsx:78,118` — both the desktop and mobile header bars moved from a near-opaque `bg-background/95` to `bg-background/75 backdrop-blur-xl`. Live screenshots (`pulse-desktop.png`, `lab-desktop.png`) show the warm glow visibly continuing under the header/logo instead of stopping at a hard edge. |
| 14 | R2 | Unexplained green glow, bottom-right, no semantic meaning | **Resolved** | `.page-frame::before` (`globals.css:182-193`) is now a single radial gradient in `var(--primary)` at 16% opacity, top-left only. The second gain-green blob is gone; the code comment at `globals.css:174-176` states the reasoning explicitly ("gain-green is a financial signal... doesn't belong in ambient chrome"). |
| 15 | R2 | Oversized superlative/metric cards | **Resolved for the cited example** | `CommunityView.tsx:1855` — Community superlatives grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (was 2-col full-size per the commit message). Overview's own hero metric cards were not independently re-measured against a "before" screenshot in this sandbox (none available) — treat as resolved for the named case, unverified for others. |
| 16 | R2 | Buttons need a full craft pass | **Resolved for the default variant**; not fully swept | Default variant now matches shadcn's own pattern closely (see #4, #10). The `SignInGate.tsx` CTA (a bespoke `className` override rather than a variant) was missed by this pass — same finding as #10. |
| 17 | R2 | All hover/glow/animation should be minimal system-wide | **Resolved, spot-checked** | `grep -rn "shadow-\[\|drop-shadow\|box-shadow:"` across `src/components` + `globals.css` surfaces exactly two non-trivial hits: the `SignInGate.tsx:187` CTA (flagged above) and the keyframe animations at `globals.css:425-500` (`overview-pulse-soft` — 6%-opacity white glow; `signin-live-pulse` — a standard green "live" status-dot ping, semantically tied to a live-market indicator, respects `prefers-reduced-motion`). Both keyframes are restrained; nothing else app-wide carries a heavy shadow. |

**Bottom line on Section 2**: 12 of 17 items check out clean. Two are
genuinely still-present Critical items (the sign-in CTA glow, #10/#16; the
incomplete glass sweep on `WatchCard`/`DailyDuelCard`, #7) that a
"everything's fixed" read of the commit messages would have missed because
the fixes were real but not exhaustive. Two more (#9, #1) are resolved only
on paper — this sandbox could not produce the populated screenshot needed
to fully close the loop, and that gap is on the environment, not asserted
away.

---

## 2. Executive verdict

The "modern but old and ugly" tension named in Round 1 has mostly resolved
into "modern and mostly good," not because the structure got fancier but
because the surface finally caught up: the app now has one real glass
system (`@layer utilities` + `color-mix` + `backdrop-filter`, not a faked
gradient standing in for it), one accent color used correctly almost
everywhere, and a header that no longer amputates its own background glow.
The two Critical items above are the leftover edges of an otherwise-real
fix pass, not evidence the pass didn't happen: a hand-rolled CTA outside
the shared `Button` variant, and two components that predate the `.glass`
sweep and never got touched by it. Both are small, mechanical fixes, not a
sign the glass-material direction needs to be re-attempted from scratch —
it has been attempted, and for the majority of the app it landed.

---

## 3. Movers component deep-dive

Two related components share "the Movers visual language" per the code's
own comment (`OverviewDashboard.tsx:293-298`):

- **`MoverTile`** (`:526-586`) — the actual Movers panel grid (`Panel`
  titled "Movers", `:1019-1050`).
- **`DriverTile`** (`:300-358`) — Sunday best/worst and weekday-driver
  cards, restyled in the same pass (`97ef169`) to match Movers instead of
  using the older plain Scoreboard cells.

Current implementation, traced end to end:

- **Shell**: `card-sheen glass ... rounded-lg ... ring-1` — real
  translucency (`.glass`) plus the hairline top highlight (`.card-sheen`),
  not the old fake gradient. `ring-gain/20` or `ring-loss/20`, brightening
  to `/40` on hover — a semantic, restrained accent ring keyed to the
  direction of the move.
- **Left accent bar**: `absolute inset-y-0 left-0 w-1 bg-gain`/`bg-loss` —
  flat color, inside `overflow-hidden rounded-lg`, so it cannot produce a
  hard-corner mismatch; there's no gradient on it to render inconsistently,
  and no separate glow layer to bleed.
- **Typography**: `font-mono tabular-nums` on price/percent/dollar figures
  (compliant with the numeric-formatting rule), ticker in a `Badge`, an
  icon (`TrendingUp`/`TrendingDown`) inline with the percent figure.
- **Interaction**: `hover:scale-[1.01] hover:bg-accent active:scale-[0.995]`
  — small, restrained, consistent with the rest of the app's card hover
  language, not a component-specific one-off intensity.
- **Spacing**: `p-6`, `gap-2`/`gap-3` — in line with the 4px/8px scale.

**What's actually wrong with it right now**: nothing found in the source
that would justify "one of the worst-looking recurring components in the
app." That characterization pre-dates `0fe25c7`/`97ef169`, both of which
touched this exact component (the commit for `97ef169` literally reads
"Overview: driver/mover contributor cards ... now use a shared DriverTile
matching the Movers panel's visual language"). The code now reads as one of
the more consistent card patterns in the codebase — shared between two call
sites instead of three divergent styles. The one open gap is empirical, not
structural: this sandbox never got a populated portfolio in front of the
Movers panel (see §0), so "does it actually render clean with real
tickers and real percentages" is not yet confirmed by a screenshot. That
verification is the one item worth re-running the moment quotes are
reachable, before calling this fully closed.

---

## 4. New finding — semantic color misuse in the Compound calculator (not a Section 2 item, found during the live pass)

`CompoundInterestSheet.tsx` is the one page that rendered fully live in
this sandbox (no market data required). It surfaced a real, repeated,
verifiable issue outside the original 17-item list:

**"Growth" figures are styled with `text-caution`/`bg-caution`** (which
resolves to `--warning`, the orange semantic token) **at six call sites**:
`:1006` (hero KPI "Of that, growth"), `:1296`, `:1302` (mobile
year-by-year cards), `:1324`, `:1348`, `:1351` (desktop year-by-year
table). `--caution`/`--warning` is defined in `globals.css:67` as literally
`var(--warning)`, and `DESIGN_TOKENS.md`'s Accent Palette table restricts
orange to "Caution/warning states only... not a general-purpose accent —
don't reach for it decoratively."

There is nothing cautionary about compounding growth — it's the entire
point of the calculator, a positive number that should read as a gain, not
a warning. Confirmed by checking what color the calculator's own chart
actually uses for this same series: the "Upside path" line
(`src/lib/compound-play.ts:156-159`) is `PALETTE.bronze` = `#d4bc79`, which
is the *current, correct* primary warm-yellow token (`oklch(0.8 0.09 90)`
converts to exactly `#d4bc79` — verified numerically). So the chart line
for this exact series is on-brand, and the six text/table treatments of
the same series are not — they're on the banned-for-decoration warning
color instead. `"You put in"` right next to it (`:1011`) already uses
`text-primary` correctly, which is what all six flagged instances should
also use (or `text-gain`, since it is unambiguously positive money).

Screenshot: `/audit-current/compound-desktop.png` — the orange "$53,199"
figure next to the green "$123,897" and near-white "$75,698" is visible
directly under "Where 10 years of this gets you."

---

## 5. Grep/CSS evidence (raw)

```
$ grep -n -i "purple\|violet\|291" src/components/ui/Panel.tsx src/app/globals.css
src/components/ui/Panel.tsx:57:   Shell      black field, lifted cards. Primary is violet. Nested is muted.
src/components/ui/Panel.tsx:219: iconTone?: "brand" | "violet" | "emerald" | "zinc";
src/components/ui/Panel.tsx:227:  violet: "bg-muted text-foreground",
src/app/globals.css:19: stroke. Replaces the earlier violet, which itself replaced the
```
No live usage of `iconTone="violet"` found anywhere in `src/`.

```
$ grep -n "shadow-\[\|drop-shadow\|box-shadow:" -r src/components src/app/globals.css
src/components/SignInGate.tsx:187: shadow-[0_18px_40px_-16px_var(--primary)]
src/app/globals.css:428,431,492,495,498: (restrained keyframe glows, see §1 item 17)
```

```
$ grep -n "bg-card" src/components/DailyDuelCard.tsx src/components/WatchlistStrip.tsx
src/components/DailyDuelCard.tsx:190: "min-h-[13.5rem] rounded-xl bg-card p-6 ring-1 ring-foreground/10"
src/components/DailyDuelCard.tsx:284: "min-h-[13.5rem] rounded-xl bg-card p-6 ring-1 ring-foreground/10"
src/components/WatchlistStrip.tsx:123: "flex h-12 items-center justify-between gap-3 rounded-md border border-border bg-card px-4"
src/components/WatchlistStrip.tsx:154: "flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4"
```

```
$ grep -n "text-caution\|bg-caution" src/components/CompoundInterestSheet.tsx
1006, 1296, 1302, 1324, 1348, 1351
```

```
$ node -e 'oklchToSrgb(0.8,0.09,90)' → [212, 188, 121] = #d4bc79
$ grep -n "brand:\|bronze:" src/lib/palette.ts → brand: "#d4bc79", bronze: "#d4bc79"
```
Confirms `--primary` (CSS) and `PALETTE.brand`/`PALETTE.bronze` (SVG/canvas/email hex)
are numerically the same color — no drift between the two rendering paths.

```
$ grep -n "chart-1:\|chart-4:" src/app/globals.css
--chart-1: oklch(0.488 0.243 264.376);   /* hue 264 — blue, unused */
--chart-4: oklch(0.627 0.265 303.9);     /* hue 303.9 — violet, unused */
$ grep -rn "chart-1\|chart-4" src --include=*.tsx --include=*.ts | grep -v globals.css
(no results — dead tokens, zero consumers)
```

```
$ grep -n "bg-background/75\|bg-background/95" src/components/AppHeader.tsx
78:  "fixed top-0 right-0 left-0 z-40 hidden bg-background/75 backdrop-blur-xl md:block"
118: "sticky ... bg-background/75 backdrop-blur-xl md:fixed ..."
```

---

## 6. Cross-page consistency notes

- Chart Y-axis label fade mask is now identically implemented in four
  places (`ComparisonChart.tsx:122`, `ForecastPanel.tsx:406`,
  `LabSheet.tsx:337,340`, `GoldNavChart.tsx:566`) — all `from-card/85
  to-card/0`, all fixed for the `to-transparent`-interpolates-to-black bug.
  Good consistency; this was a real cross-component fix, not a one-off.
- `.glass`/`.glass-well` coverage is uneven across pages: Overview's own
  cards (Panel, MoverTile, DriverTile, PortfolioLane) got it; Watchlist's
  `WatchCard` and `DailyDuelCard` did not (§1 item 7). Anyone auditing a
  single page would call translucency "done"; checking every page finds
  the gap.
- The accent-bar-on-card-edge pattern (Movers, drivers) is now genuinely
  shared via one component (`DriverTile`) instead of three near-duplicates
  — a real consistency win from the `97ef169` pass.

---

## 7. Senior designer suggestions (not compliance findings)

- **`SignInGate.tsx`'s CTA glow (High impact / Small effort).** Beyond
  being a Section 2 regression, a single glowing button on an otherwise
  restrained, dark, glassy page reads as inconsistent taste, not
  intentional emphasis. Match it to the in-app `Button` default (flat
  fill, `shadow-xs`) or, if some emphasis is wanted for a landing-page CTA
  specifically, cut the blur radius by at least half and the opacity
  significantly rather than removing it outright.
- **`GoldNavChart.tsx` (Low impact / Small effort).** The file name and an
  internal comment ("Book NAV as a gold line") are leftover vocabulary from
  before the accent moved off gold. The color itself is correct
  (`PALETTE.brand`, verified numerically above) — this is a naming/comment
  cleanup, not a visual bug, but it will keep confusing the next person who
  greps for "gold" expecting a bug and finds a correctly-colored file.
- **Dead `iconTone: "violet"` variant (Low impact / Small effort).**
  `Panel.tsx:219,227` — unused, and its own name no longer describes what
  it does (`bg-muted text-foreground`, i.e. neutral). Either delete it or
  rename it to something that matches its actual output.
- **Unused `--chart-1`/`--chart-4` tokens (Low impact / Small effort).**
  Both sit outside the documented four-color Accent Palette (one is
  literally violet, hue 303.9°) and have zero consumers. Harmless today,
  but a landmine for the next person who reaches for "a chart color" and
  grabs one of these instead of the four sanctioned tokens. Worth deleting
  alongside the `--accent-amber`/`--mustard` cleanup already done.
- **Button variant taste call (Medium impact / already-made decision,
  flagged for confirmation).** The default button dropped its gradient
  entirely rather than "making the gradient richer," which is what Round 1
  literally asked for. The result reads clean and shadcn-correct, and is
  the more defensible choice under the Apple-glass direction — but it's
  worth a one-line confirmation from Martin that "flat, no gradient" was
  the intended resolution and not a different problem being solved instead
  of the one that was asked about.

---

## 8. Prioritized punch list

### Compliance fixes (in order)

1. **[Critical, R2 #10/#16]** `SignInGate.tsx:187` — shrink/remove the
   `shadow-[0_18px_40px_-16px_var(--primary)]` glow on the Google sign-in
   button to match the app's restrained button language.
2. **[Critical, R2 #7]** `WatchlistStrip.tsx` `WatchCard` (both states,
   ~lines 123 and 154) and `DailyDuelCard.tsx:190,284` — migrate the
   leftover `bg-card`/`bg-card ring-1 ring-foreground/10` pattern to
   `.glass`/`.glass-well` per the documented sweep in `DESIGN_TOKENS.md`.
3. **[Major, new]** `CompoundInterestSheet.tsx:1006,1296,1302,1324,1348,1351`
   — replace `text-caution`/`bg-caution` with `text-primary`/`bg-primary`
   (or `text-gain`/`bg-gain`) for the "growth" figures; orange is
   warning-only per the Accent Palette.
4. **[Minor]** Delete the dead `iconTone: "violet"` variant
   (`Panel.tsx:219,227`) and the stale "Primary is violet" doc comment
   (`Panel.tsx:57`).
5. **[Minor]** Delete unused `--chart-1`/`--chart-4` tokens
   (`globals.css`) — zero consumers, outside the sanctioned palette.
6. **[Minor]** Rename `GoldNavChart.tsx` / update its "gold line" comment
   to match the current brand-yellow naming (`palette.brand`).

### Design-quality suggestions (see §7 for detail)

- Confirm the flat-fill button direction with Martin (Medium/decision).
- Re-run the Movers-panel visual check the moment live quotes are
  reachable in a dev sandbox (High confidence it's fine, but unconfirmed
  by pixels — see §3).
