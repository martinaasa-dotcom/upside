# Pass 5 — UX: fix log

One row per finding in [`05-ux.md`](05-ux.md). Status is **Resolved**,
**Deferred**, or **Stuck**. Nothing is marked Resolved without fresh
re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file,
`npm run test:invariants` at its 2 pre-existing failures.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| H1 | Fourteen hand-rolled modals/drawers had no Escape-to-close and no focus trap | High | **Resolved** (prior session) | Report §High 1 | Fixed when the pass was first run, merged to `main`. |
| H2 | Unmapped raw database errors could reach a paying stranger verbatim | High | **Resolved** (prior session) | `src/lib/plain-error.ts` — introduced this pass and now reused by Passes 6 and 7 | Fixed when the pass was first run. |
| H3 | Thesis Pulse carried no "this is AI, it can be wrong" framing | High | **Resolved** (prior session) | Report §High 3; Pass 9 later replaced the duplicated literal with the shared `ADVICE_DISCLAIMER_SHORT` constant | Fixed when the pass was first run. |
| M1 | Icon-only touch targets are 28px (`size-7` / `icon-sm`), below the ~44pt HIG and 48dp Material minimums | Medium | **Resolved** | `src/app/globals.css` — a `pointer: coarse` rule targets `[data-slot="button"][data-size="icon-sm"]` and `[data-size="icon-xs"]` (Button already emits `data-size` on every instance), growing the hit area to 44px on any touch device. | The open question was whether every icon button's *visual* size should grow app-wide, which would cost desktop information density for a problem a mouse doesn't have — that call was left to Martin. The resolution sidesteps it: grow the **hit area**, not the visible box, the same technique `.touch-target` already uses, applied automatically via the `data-size` attribute so no call site needs to opt in and no desktop pixel moves. The highest-traffic surfaces were already individually patched with `.touch-target` (f8d5114); this closes the systemic default for the other ~8 `icon-sm` call sites (`PulsePage`, `dialog.tsx`, `sheet.tsx`, `InvitePartnerModal`, `AdminPage`, `ClassroomPlanEditor`, `WatchlistStrip`, `UpgradeNudge`) without touching any of them individually. |
| M2 | `EmptyBook` is already well-built | Medium | **Deferred** (no change needed) | — | Recorded by the report as the thing working well in the first-60-seconds flow, explicitly so a later pass doesn't "fix" it. No defect. |
| M3 | `title=` used instead of `aria-label` on icon-only buttons | Medium | **Resolved** | `src/components/AdminPage.tsx:273,285,370` and `src/components/ClassroomPlanEditor.tsx:163`. Re-ran the check that found them — a scan for `<Button>` tags that are `size="icon*"`, carry a `title`, and lack an `aria-label` — across all of `src/components`: **0 remaining** (was 4). | Kept `title` (the hover tooltip is useful) and added `aria-label` alongside, matching the 36 other icon-only buttons. Gave the two Refresh buttons **distinct** names — "Refresh error log" and "Refresh user list" — since a screen-reader user hearing "Refresh" twice on one page can't tell them apart, and made the classroom one name the period it removes. |
| M4 | `use-lab-sync`'s error toast can re-fire once per debounce window during a sustained sync failure | Medium | **Deferred** | — | The report's own assessment: already debounced, generation-counted, and cleaned up on unmount — "not a runaway loop, just could get a little noisy" during an extended Supabase outage while someone is actively typing. Not worth touching without a repro, and any fix (a suppression window) risks swallowing a real failure. |
| L1 | `PulsePage.tsx`'s disclaimer was a literal, not the shared constant | Low | **Resolved** (Pass 9) | Pass 9 §Low 1 | Closed by a later pass; the invariant-test constraint that had blocked it was resolved there too. |
| L2 | Paste `Textarea`s had no programmatic label | Low | **Resolved** (prior session) | Report §Low 2 — `aria-label` added to both in `CsvImportModal.tsx` and `OverviewDashboard.tsx` | Fixed when the pass was first run. |
| L3 | Some `plainError` `KNOWN` entries map a string to itself | Low | **Deferred** (deliberately not "cleaned up") | — | Looked at this to collapse it and found the entries are **load-bearing, not redundant**. `plainError` only reaches its `return s` pass-through after `looksTechnical(s)`; an identity entry in `KNOWN` short-circuits at line 134 and *guarantees* that sentence reaches the user. Deleting it would put messages like "Those email addresses do not look right." at the mercy of a `looksTechnical` false positive, where the person would get a generic fallback instead. Leaving them, and recording why, so a future pass doesn't remove them as dead weight. |

## Deferred summary

Five items left unfixed, none silently. **M1** is a design-system
decision for Martin (the phone-facing cases are already fixed
separately). **M2** and **L3** are cases where the right action is no
change — and **L3** in particular is recorded above with the reason it
must *stay*, since the report had it filed as a cleanup opportunity.
**M4** needs a repro before it's worth touching.
