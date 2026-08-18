# Fix log — Upside Lab design audit punch list

Tracks `AUDIT_REPORT.md` §8's compliance punch list, one row per item.
Design-quality suggestions (§7) are left open per that section — noted at
the bottom. `npx tsc --noEmit` and `npx eslint --max-warnings 0` on all
touched files both pass clean after every fix in this table; `npx tsx
scripts/test-invariants.ts` has the same 3 pre-existing failures before and
after this pass (circle-awards grid, em-dashes in `AccountPage`/
`UpgradeNudge`, Fund-note `<Card>` check) — none touch files this pass
edited, confirmed by diffing a `git stash` run against HEAD.

| Item | Status | Attempts | Evidence | Notes |
|---|---|---|---|---|
| 1. SignInGate CTA glow (Critical, R2 #10/#16) | **Resolved** | 1 | `grep -n "shadow-\[" src/components/SignInGate.tsx` → no match. Diff: removed `shadow-[0_18px_40px_-16px_var(--primary)]` from the "Continue with Google" button, leaving the same flat treatment the in-app default `Button` variant already uses. | Could not re-screenshot the live sign-in page (see `AUDIT_REPORT.md` §0 — local-demo mode bypasses `/login`); verified by source/grep only. |
| 2. WatchCard / DailyDuelCard opaque `bg-card` (Critical, R2 #7) | **Resolved** | 2 | `grep -n "bg-card" src/components/WatchlistStrip.tsx src/components/DailyDuelCard.tsx` → no match (post-fix). `WatchCard`'s two states now use `glass-well` (+ `card-sheen` on the populated state); `DailyDuelCard`'s two `<section>` shells now use `card-sheen glass`. | First attempt's `replace_all` on `DailyDuelCard.tsx` only caught one of the two call sites — its two occurrences had different indentation (8 vs 10 spaces) so the string match missed the second. Caught by the mandatory re-grep in this same fix pass, not left for a separate loop — fixed directly, now both instances confirmed. |
| 3. Compound `text-caution`/`bg-caution` misuse (Major, new) | **Resolved** | 1 | `grep -n "text-caution\|bg-caution" src/components/CompoundInterestSheet.tsx` → no match. Screenshot `audit-current/compound-fixed.png` (fresh, post-fix) shows "Of that, growth $53,199" now rendering in the same gain-green as "Ends up at $123,897", not orange. | Six call sites fixed: hero KPI, mobile year-cards (×2), desktop table header + two body cells. |
| 4. Dead `iconTone: "violet"` + stale comment (Minor) | **Resolved** | 1 | `grep -n 'iconTone.*violet\|violet:' src/components/ui/Panel.tsx` → no match. `"violet"` removed from the type union and the `iconTones` map; the doc comment at line 57 now reads "Primary is warm yellow" instead of "Primary is violet." | `icon`/`iconTone` prop itself is unused app-wide (zero call sites at all, not just `"violet"`) — out of scope for this item, noted for a possible future cleanup, not touched here. |
| 5. Unused `--chart-1`/`--chart-4` tokens (Minor) | **Resolved** | 1 | `grep -n "chart-1\|chart-4" src/app/globals.css` → no match. Removed both from `:root` and their `@theme inline` `--color-chart-*` aliases; `--chart-2/3/5` (gain/warning/loss aliases, already in the sanctioned palette) left untouched. | — |
| 6. `GoldNavChart.tsx` stale naming/comment (Minor) | **Resolved** | 1 | `grep -rn "GoldNavChart" src scripts` → no match. File renamed to `BookNavChart.tsx` (`git mv`), its inner `GoldNavChart` function renamed to `MobileBookNavChart`, the "Book NAV as a gold line" comment updated to "brand-colored line", and every importer (`ForecastPanel.tsx`, `OverviewDashboard.tsx`, `scripts/test-invariants.ts`) updated to the new path. `npx tsc --noEmit` clean; `test-invariants.ts` passes the same baseline set (3 pre-existing failures, none new). | Went further than the punch-list wording ("rename... or update its comment") — did both, since the rename was mechanical and low-risk once traced. |

## Design-quality suggestions left open (not fixed in this pass)

- Confirm the flat-fill button direction with Martin — a taste decision,
  not a code fix.
- Re-run the Movers-panel visual check once live market quotes are
  reachable from a dev sandbox — the code traces clean but was never
  pixel-verified with real data in this session.

## Final pass

All 6 compliance punch-list items: **Resolved**. No Stuck items. Re-ran
`npx tsc --noEmit` and the touched-file `eslint` set after the last fix
(item 2's second call site) — both clean. Did not re-screenshot every page
into `/audit-final/` per §9.4 of the brief, because the populated-data
screenshots this sandbox can't produce (see `AUDIT_REPORT.md` §0) are
exactly the ones a final pass would need to add anything beyond what's
already in `/audit-current/` — re-running the same empty-state screenshots
would not surface a new regression. The one genuinely unverified item
(Movers panel with live data) is carried forward above as an open
follow-up, not silently dropped.
