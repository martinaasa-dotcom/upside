# Pass 3 — Performance Audit

Scope: production bundle size (`next build`), server/client component
boundaries (`"use client"` usage), N+1 queries in `src/app/api/*`, image
handling, the market-data fetch/cache layer (`src/lib/market/*`), route
runtime declarations, and a qualitative Core Web Vitals check via a local
demo-mode render (no live Supabase credentials in this sandbox — see
"Lighthouse / CWV" below). Read against `AGENTS.md` first so intentional
patterns (the multi-provider quote/LLM fallback chains, the quote cache,
the existing room-level `next/dynamic` split) weren't re-flagged as bugs.

Branch: `claude/audit-performance`, based on `origin/main` @ `3a53f92`.

## Summary

| Severity | Count | Fixed |
|---|---|---|
| Critical | 1 | 1 |
| High | 1 | 1 |
| Medium | 3 | 0 (backlog) |
| Low | 2 | 0 (backlog) |

`npm run build` (Turbopack) succeeds with no errors on both the before and
after trees. `npm run typecheck`, `npm run lint`, and `npx vitest run`
(100/100) are all clean after the fixes. `npx tsx scripts/test-invariants.ts`
shows the same 2 pre-existing, unrelated failures called out in the task
(`circle awards are a grid of cards, not a flat divided list` and `Fund page
labels Margus's note Thesis`) and nothing new — see "Test run" at the bottom.

---

## Critical

### 1. Every visit to the book shipped every tab's JS, not just the one open

**Where:** `src/components/Dashboard.tsx` (formerly lines 10–24 in the
import block).

**What's wrong:** `Dashboard` is the client component behind the app's
default landing surface (`BookRoom` → `SignInGate` → `Dashboard`, wired up
in `src/components/workspace-rooms.tsx`), and it is what every signed-in
user — including a brand-new paying stranger — sees on first paint after
sign-in. It statically imported `PulsePage` (1,323 lines),
`LabSheet` (696 lines, itself pulling in `SeasonalityPage`, `TrendsPanel`,
and `ScenarioSimulator`), `CompoundInterestSheet` (1,441 lines),
`ForecastPanel` (1,346 lines), and `CoveredCallPanel` (442 lines) — five
panels that only one of which is ever visible at a time (`isPulse`,
`isLab`, `isCompound`, `isOverview`, and the holdings/forecast/covered-call
default branch are mutually exclusive in the render, `Dashboard.tsx`
~3593–3748). Someone who opens their book and never leaves the default
Overview tab still downloaded and parsed all of them.

The codebase already has the right pattern for this — the file comment
right above the existing `CcAdvisorChat` dynamic import explains it
directly: *"Margus is a collapsed floating panel almost nobody opens on
first paint, but eagerly importing him put the AI SDK, react-markdown,
remark-gfm and zod on every dashboard load. Deferred here…"* — and
`WorkspaceShell.tsx` already applies the same idea one level up (`BookRoom`,
`FundRoom`, `CommunitiesList`, `CommunityView`, `AccountPage`, `AdminPage`
are all `next/dynamic`). The five tab panels inside `Dashboard` were the
one place that pattern hadn't been extended to.

**Fix:** Converted `PulsePage`, `LabSheet`, `CompoundInterestSheet`,
`ForecastPanel`, and `CoveredCallPanel` to `next/dynamic` imports
(`src/components/Dashboard.tsx:221–244`), `ssr: true` to match the rest of
`WorkspaceShell`'s dynamic components — a direct link or refresh on
`/?tab=pulse` (used by the mobile Pulse tab and elsewhere) still renders
server-side instead of flashing a loading state, unlike `CcAdvisorChat`
which is `ssr: false` because it's a rarely-opened floating panel. The tiny
`ForecastOffStub` and the `COVERED_CALLS_ANCHOR` string constant stayed as
regular imports/an inlined literal (`"covered-calls"`,
`Dashboard.tsx:1493`) since pulling in the whole `CoveredCallPanel` module
just for a 13-byte id string would have defeated the split.

**Measured effect** (production build, before vs. after, `/` route):
the single largest script referenced by the page dropped from one 569 KB
monolith (`Dashboard` + all five panels bundled together) to a max of
253 KB, now spread across parallel-loadable chunks; total script bytes
referenced by `/`'s initial HTML dropped from ~1.85 MB to ~1.70 MB. The
important change isn't just the byte count — it's that Pulse, Lab,
Compound, Forecast, and Covered Calls no longer block parse/hydrate of the
Overview tab that most sessions actually land on.

---

## High

### 2. CSV/holdings import did one sequential database round trip per row

**Where:** `src/app/api/holdings/import/route.ts` (the per-row
update/upsert loop, and the per-row delete loop for `replace`).

**What's wrong:** This is the route behind the CSV import flow AGENTS.md
specifically calls out as needing to keep working "for people who aren't
Martin's family" — i.e. exactly the onboarding path a new paying stranger
uses to bring in a real brokerage CSV. The handler read all existing
holdings once, then looped `for (const row of rows) { await
supabase...update(...) }` / `await supabase...upsert(...)`, issuing one
Postgres round trip per CSV line, fully serially — a 30-position import
meant 30 sequential awaited writes end-to-end before the response came
back. The `replace` cleanup path did the same thing for deletions: `for
(const h of toRemove) { await supabase...delete()... }`.

**Fix:**
- The per-row update/insert loop now runs as `Promise.all(rows.map(async
  (row) => { ... }))` (`src/app/api/holdings/import/route.ts:149–213`),
  turning N serial round trips into N concurrent ones. This preserves every
  existing behavior exactly: the `sortBase` counter, the `keep` set, and
  the `failed`/`upserted` accumulators are all still correct, because each
  row's synchronous prefix (ticker/shares validation, the `byTicker`
  lookup, the `sortBase` bump) runs to completion before the next row's
  callback starts — `.map()` only interleaves at the `await`, so the
  sort-order allocation stays deterministic and in CSV order. This mirrors
  a pattern already used a few lines further down in the same file for
  `salePriceFor` (`route.ts:282–292`), so it's consistent with the
  existing style rather than a new idiom.
- The `replace` delete loop is now a single batched
  `.delete().in("id", toRemove.map(h => h.id))`
  (`src/app/api/holdings/import/route.ts:219–228`) instead of one `DELETE`
  per removed row.

`npx vitest run` and `npm run typecheck`/`lint` are clean after this
change; there's no existing test file for this route's write path, so this
was verified by re-reading every downstream use of `byTicker`, `keep`,
`failed`, `upserted`, and `removed` to confirm nothing depended on the old
per-row ordering after the loop.

---

## Medium (backlog, not fixed this pass)

### 3. Classroom starting-cash change loops one `UPDATE` per student sheet

**Where:** `src/app/api/communities/[id]/route.ts:451–462` (inside
`handlePATCH`, only when `body.startingCash` changes on a classroom).

When a teacher changes a class's starting cash, every enrolled student's
paper-sheet `cash_balance` needs the same delta applied, and the route does
`for (const sheet of sheets) { await supabase.from(portfolios).update(...) }`
— one sequential round trip per student. This is a real O(students)
sequential-query pattern, but unlike the community book/leaderboard reads
it's admin-only and infrequent (a teacher changing the class's starting
cash, not something every page load hits), so it doesn't meet this pass's
bar for Critical/High. For a 30-student class it's still ~30 sequential
writes (plausibly &gt;1s) on an action a teacher might reasonably want to feel
instant. Recommended fix: a Postgres function analogous to
`portfell_apply_cash_delta` (`supabase/migrations/041_atomic_cash_delta.sql`)
that takes a `classroom_community_id` and delta and does the update in one
statement (`UPDATE ... SET cash_balance = cash_balance + delta WHERE
classroom_community_id = $1`), since PostgREST's `.update()` can't express
a column-relative delta across a batch. Left unfixed here because it needs
a new migration, which this pass's scope says not to guess at — see "Needs
a decision."

### 4. Lab's own sub-tabs (Seasonality, Trends, Scenario) are still one bundle

**Where:** `src/components/LabSheet.tsx:13,26,27` (`ScenarioSimulator`,
`SeasonalityPage`, `TrendsPanel` imports).

Now that `LabSheet` itself is split out of `Dashboard` (Critical #1), the
Lab meta-tab loads as its own chunk — but that chunk still eagerly bundles
its three sub-tabs together, even though a visitor to Lab only looks at one
sub-tab at a time. Lower priority than #1 because Lab is already
tier-gated (hidden by default for the novice tier, and `TIER_HIDDEN_LAB_TABS`
already hides some sub-tabs per tier per `AGENTS.md`), so the audience for
this chunk is smaller than the main book. Worth a follow-up `next/dynamic`
pass inside `LabSheet` the same way this pass did for `Dashboard`.

### 5. Small avatar/logo `<img>` tags aren't `next/image`

**Where:** `src/components/HeaderOverflowMenu.tsx:58`,
`src/components/mobile/MobileTopBar.tsx:132`,
`src/components/UpsideLogo.tsx:23`.

All three are already `// eslint-disable-next-line @next/next/no-img-element`
with a reason in the comment (static header mark, Google avatar URL at a
fixed small size), so this looks like a call a previous pass already made
deliberately rather than an oversight. Left as-is; noting only because the
task asked to confirm `next/image` coverage everywhere an image renders.
The two screenshot-preview `<img>` tags in `src/components/CcAdvisorChat.tsx`
(1231, 1343) render blob/data-URI previews of a just-picked file before
upload — `next/image` doesn't apply there (no remote optimization to do on
a local object URL), so those are also correctly raw `<img>`.

---

## Low (backlog)

### 6. No route uses the Edge runtime

`grep` across `src/app/api` found zero `export const runtime = "edge"`
declarations; 12 routes explicitly pin `"nodejs"` (billing webhook,
book/nav-history, ytd-from-image, forecast/plan, market/events,
market/search, market/seasonality, options/scan, quotes, thesis/pulse,
upside-portfolio/teaser, cron/margus-fund) and everything else inherits
Next's Node default implicitly. This isn't a mismatch — Node is genuinely
required for Stripe and the service-role Postgres/Resend/AI-provider calls
most routes make — but it does mean nothing gets Edge's lower cold-start
latency for simple, frequently-hit reads. See "Needs a decision" below;
not changed in this pass.

### 7. SSR of `/` renders a loading shell, not the real dashboard

Confirmed by building and running the app locally in this sandbox's
demo/no-Supabase mode (see "Lighthouse / CWV" below): the server-rendered
HTML for `/` is `DashboardLoading` — a centered pulsing logo and "Opening
your portfolio …" — not the portfolio itself. `SignInGate` only renders
`children` once `useAuth()`'s `ready`/`user` state resolves client-side, so
personalized content (holdings, quotes) always waits for a client-side
fetch after hydration, even in demo mode. This is inherent to a
per-user, auth-bound finance app — real content can't be cached/SSR'd at
the edge without the viewer's own session — so it isn't something to "fix"
in this pass; noted as a qualitative Core Web Vitals observation (flash of
loading content, later LCP than a fully-SSR'd page) rather than a bug with
a quick patch.

---

## Reviewed, no issues found

- **Bundle contents:** no `recharts` in `package.json` (not present at all —
  charts in this app are hand-rolled SVG). `yahoo-finance2` is correctly
  declared in `next.config.ts`'s `serverExternalPackages`. Grepped every
  built client chunk in `.next/static/chunks` for Stripe/Yahoo/OpenRouter/
  Groq/Gemini API-endpoint strings and found none — `stripe`, `resend`,
  `@ai-sdk/openai`, and `ai` stay server-side (the one `resend(` hit inside
  a client chunk was Supabase auth-js's own `.resend()` confirmation-email
  method, not the Resend email SDK — verified by inspecting the
  surrounding bytes).
- **N+1 queries in `src/app/api/communities/*`:** read every route under
  `src/app/api/communities` (`route.ts`, `[id]/route.ts`, `[id]/book/route.ts`,
  `[id]/sheets/route.ts`, `[id]/invites/route.ts`, `[id]/duel/route.ts`,
  `[id]/members/[userId]/route.ts`, `[id]/join-request/route.ts`,
  `discover/route.ts`, `join/route.ts`). All of them — including the
  community book/leaderboard endpoint, the actual hot page for a
  multi-member circle — already batch member/profile/portfolio/holding
  reads with `.in()` and `Promise.all()`, with comments in the code (e.g.
  `[id]/route.ts:49–51`, `[id]/book/route.ts:39–40`) showing this was a
  deliberate earlier pass, not an accident. The invariants suite even has a
  dedicated check for this: `membership checks do not run one query per
  community` (passing). `src/app/api/admin/overview/route.ts` and
  `src/app/api/portfolios/route.ts` were spot-checked too — same pattern.
- **Market data fetch/cache layer** (`src/lib/market/quotes.ts`,
  `quote-store.ts`): `fetchQuotesWithFallback` de-dupes the requested
  ticker list up front, and `quote-store.ts` already layers an in-memory
  cache in front of a Supabase-backed cross-instance cache
  (`recallQuotes`/`rememberQuotes`), so repeat requests for the same
  ticker within the fallback-chain TTL don't re-hit Yahoo/Twelve
  Data/Finnhub. `PulsePage`'s extra `fetchQuote()` calls
  (`src/components/PulsePage.tsx:431`) only fire when a looked-up ticker
  isn't already in the quote map passed down from `Dashboard` — not a
  redundant re-fetch of tickers already on screen.
- **Images:** every other `<img>` in the codebase not called out above
  already goes through `next/image` or isn't a rendered raster image.

---

## Needs a decision

- **Bulk classroom cash-delta RPC** (Medium #3): fixing this properly means
  adding a new Postgres function/migration, which this pass's instructions
  say not to guess at. Worth doing if teacher-side class-cash edits become
  a more frequent action as the classroom feature grows.
- **Edge runtime for simple reads** (Low #6): moving something like
  `/api/auth/me` or `/api/communities/discover` to `export const runtime =
  "edge"` could shave latency for globally-distributed users, but it's
  unverified whether the Supabase JS client and the in-memory rate-limit
  store (`src/lib/rate-limit.ts`, flagged as a Medium in the Pass 2 security
  report) behave correctly on Edge. Needs a deliberate check, not a
  blanket switch.

---

## Test run

```
npm run typecheck   # clean
npm run lint        # clean (--max-warnings 0)
npm run build       # clean, both before and after the fixes
npx vitest run      # 22 files, 100/100 tests passing
npx tsx scripts/test-invariants.ts
  # 2 failed, matching exactly the pre-existing/unrelated failures named
  # in the task:
  #   fail  circle awards are a grid of cards, not a flat divided list
  #   fail  Fund page labels Margus's note Thesis
  # everything else passes, including:
  #   ok  membership checks do not run one query per community
  #   ok  Lab market reads are shared per ticker, not fetched per visitor
```
