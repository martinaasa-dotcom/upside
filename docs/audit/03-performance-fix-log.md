# Pass 3 — Performance: fix log

One row per finding in [`03-performance.md`](03-performance.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file, `npm run build`
compiles successfully, `npm run test:invariants` at its 2 pre-existing
failures (`circle awards…`, `Fund page labels…` — unrelated to these
files).

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| C1 | Every visit to the book shipped every tab's JS, not just the one open | Critical | **Resolved** (prior session) | `src/components/Dashboard.tsx:206-244` — per-tab `next/dynamic` splits | Fixed when the pass was first run, merged to `main`. Finding #4 below is the follow-up it explicitly called for. |
| H2 | CSV/holdings import did one sequential database round trip per row | High | **Resolved** (prior session) | Report §High | Fixed when the pass was first run. |
| M3 | Classroom starting-cash change loops one `UPDATE` per student sheet | Medium | **Resolved** (partially — see notes) | `src/app/api/communities/[id]/route.ts:446-469`. The `for … await` is now a single `Promise.all` over the sheets, so a 30-student class issues 30 concurrent writes instead of 30 sequential round trips. | The report's preferred fix was a new Postgres function taking a `classroom_community_id` and a delta (PostgREST's `.update()` can't express a column-relative delta across a batch). That needs a migration **and a manual production apply**, which is exactly the operational debt Pass 8 is already carrying — so this takes the pure-code half of the win now and leaves the single-statement version as a genuine follow-up. The remaining cost is one round trip per sheet, but they overlap rather than queue. |
| M4 | Lab's own sub-tabs (Seasonality, Trends, Scenario) were still one bundle | Medium | **Resolved** | `src/components/LabSheet.tsx:29-49` — `ScenarioSimulator`, `SeasonalityPage`, and `TrendsPanel` are now `next/dynamic`, the same pattern `Dashboard` uses for its meta-tabs. Verified against a real production build, not just the source: every chunk carrying Seasonality's `SeasonalityPaint` internals returns `0` for LabSheet's own `concentrationRead`, and vice versa — they are genuinely separate chunks now, where before Lab's chunk carried all three sub-tabs. | Kept `ssr: true` to match `Dashboard`'s existing meta-tab splits, so nothing changes about what renders on the server. |
| M5 | Small avatar/logo `<img>` tags aren't `next/image` | Medium | **Deferred** | — | Not a defect. All three call sites already carry an `eslint-disable` with a stated reason (static header mark; a Google avatar URL at a fixed small size), and the two in `CcAdvisorChat.tsx` render local blob/data-URI previews where `next/image` has nothing to optimize. The pass listed this only to confirm coverage was checked. |
| L6 | No route uses the Edge runtime | Low | **Deferred** | — | Node is genuinely required for Stripe and the service-role Postgres/Resend/AI-provider calls most routes make. Moving any route to Edge is a per-route judgment call about which reads are simple enough to qualify — the report itself routed this to "Needs a decision" rather than proposing a change. |
| L7 | SSR of `/` renders a loading shell, not the real dashboard | Low | **Deferred** | — | Inherent to a per-user, auth-bound finance app: personalized content can't be server-rendered or edge-cached without the viewer's own session. The report classified this as a qualitative observation rather than a bug with a patch. |

## Deferred summary

Three items left unfixed, none silently: **M5** is a set of deliberate,
already-documented exceptions rather than a gap; **L6** and **L7** are
architectural calls the report itself declined to make unilaterally. The
one partially-closed item is **M3**, where the single-statement Postgres
version is named above as a follow-up that needs a migration and a manual
production apply.
