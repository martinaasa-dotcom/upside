# Pass 1 — Visual Cohesion ("Apple-like glass")

Audited: `main` as of PR #29 (`8c881ed`).

## A note on how this pass actually played out

A first run of this pass was done from an isolated worktree against
`main @ 55f052c`. At that point in time `.glass`/`.glass-well` did not
exist on `main` at all, `--primary` was still shadcn's stock gray, and
`--warning` was the old gold hue — because the design-unification work
that introduced all of that (PRs #26, #27) was still sitting unmerged on
a different branch.

By the time that first run finished, #26 and #27 had merged, **and** a
second, independent round of live design feedback had landed as #28/#29
— which specifically retuned `.glass`/`.glass-well` translucency, added
an outer drop-shadow, and bumped the hairline ring on every top-level
card from `ring-foreground/10` to `/18` (fixing panels that had gone
translucent enough to disappear into the field). The first run's fixes
(written against the pre-#26 baseline, with its own `.glass` values)
would have reverted that work if merged. They were discarded in favor of
this corrected pass, re-verified against `main` in its current, actual
state.

## Critical / High

None open. The three Critical items the first run found
(`.glass`/`.glass-well` missing, `--primary` not the documented brand
color, `--warning` sharing a hue family with the brand accent) are all
resolved on current `main` — confirmed directly against
`src/app/globals.css`, not assumed from commit messages:

- `--primary: oklch(0.8 0.09 90)` (warm yellow, matches `AGENTS.md`)
- `--warning: oklch(0.63 0.22 45)` (true orange, off the brand hue)
- `.glass` / `.glass-well` exist in `globals.css`, wired through
  `Panel.tsx`'s `BOX`/`CARD`/`SCORE_CELL`/`LIST`/`SHELL_TONES`, the
  shadcn `Card` primitive, and every hand-rolled card shell that used to
  duplicate `rounded-xl bg-card ring-1 ring-foreground/10`
- Every top-level glass ring is `ring-foreground/18` (bumped from `/10`
  in #29 specifically so cards don't disappear into the true-black
  field), with a soft outer drop-shadow on `.glass` for lift
- `.page-frame::before` ambient corner glow exists, driven by
  `--primary`, with a second dimmer corner (#28)

## Medium (backlog — not fixed this pass)

- **`text-[0.8rem]` in `src/components/ui/button.tsx:27` and
  `src/components/ui/toggle.tsx:20`** (the `sm` size variant) — an
  off-scale arbitrary value (12.8px) between `text-xs` (12px) and
  `text-sm` (14px). `Panel.tsx`'s own documented type scale explicitly
  bans `text-[Npx]`. Internally consistent between the two files (same
  value in both), and the visual delta from `text-sm` is under 1.5px,
  so low-severity — but it's a real scale violation and the one that
  turned up in a broad sweep for arbitrary `text-[...]` values across
  `src/app` and `src/components`. Fixing it means picking `text-xs` or
  `text-sm` for every small button/toggle app-wide, a one-line change
  but visible on every screen — left for a deliberate decision rather
  than guessed at here (see "Needs a decision").
- **`src/components/CommunitiesList.tsx:266`** hand-rolls
  `animate-pulse rounded-lg bg-muted` instead of the shared `<Skeleton>`
  component (`animate-pulse rounded-md bg-muted`) — visually
  near-identical (`rounded-lg` vs `rounded-md`), a code-hygiene gap
  rather than a visible inconsistency.
- **Overlay/floating surfaces are self-consistent but not glass**:
  `Dialog`, `Sheet`, `Drawer`, `Popover`, `DropdownMenu`, `Select`, and
  `Command` all use one deliberate pattern — opaque `bg-popover` +
  `ring-1 ring-foreground/10-20`, `backdrop-blur-xs` only on the dimming
  scrim behind them, never on the content panel itself. That's now the
  one remaining place in the app where "glass" doesn't apply, now that
  top-level cards do. See "Needs a decision."

## Low (backlog — not fixed this pass)

- `global-error.tsx` hardcodes hex colors for its retry button instead
  of the brand primary — deliberate and documented (this file replaces
  the root layout when the layout itself throws, so it can't rely on
  `globals.css`/providers being available), not a real inconsistency.
- `UpsideLogo.tsx`'s arbitrary `text-[...]` sizes — already a documented
  exception in `Panel.tsx`'s own type-scale comment ("the logo lockup is
  the exception"). Not a new finding.
- `native-select.tsx`'s `bg-[Canvas] text-[CanvasText]` — CSS
  system-color keywords for native `<select>` popup theming, a technical
  necessity, not a token violation.
- Icon stroke width (lucide-react): spot-checked across several nav/dock
  components — every explicit `strokeWidth` override on an actual lucide
  icon is `2` (the library default). The non-2 values elsewhere are raw
  SVG chart-line/point strokes, not icon glyphs — not a same-purpose
  inconsistency.
- Dark/light mode: `next-themes` is an installed dependency but never
  imported anywhere in `src/` — no `ThemeProvider`, no `useTheme` call.
  The app is single-theme by design (`html { color-scheme: dark }`), so
  "does it hold up in light mode" doesn't apply; flagged only because
  the unused dependency could mislead a future reader into expecting a
  toggle.
- Page container widths and Radix/shadcn primitive coverage: no
  arbitrary-width one-offs or hand-rolled modal/overlay reimplementations
  turned up in this pass's sampling.

## Needs a decision

- **Should floating/overlay chrome (Popover, DropdownMenu, Select,
  Dialog, Sheet, Drawer, Command) also become `.glass`, now that
  top-level cards are?** They're deliberately opaque today — legible,
  shadcn-standard — but will read visually flatter than the
  translucent cards around them. Blur on dropdown/select text risks
  hurting legibility on small menu items, so this is a real design call,
  not a technical-correctness fix.
- **`text-[0.8rem]` button/toggle `sm` size** (Medium, above) — worth a
  decision on `text-xs` vs `text-sm` rather than a guess, since it's a
  one-line change visible on every screen.

## Severity counts

- Critical: 0 open (3 found in an earlier snapshot, all independently
  resolved by #26–#29 before this report was finalized)
- High: 0
- Medium: 3 (backlog)
- Low: 6 (backlog)
- Needs a decision: 2
