# Pass 3 — Performance & perceived responsiveness (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `d2a670b` (main, after Pass 2 closed)

> Round 2 re-derivation. Nothing from any prior performance note was carried
> over as fact. Numbers below are measured — from rendered pixels, from a
> throttled browser, or from counted round trips — not estimated.

**Headline:** the app's *front end* is in good shape and got 4× faster at
first paint. The problem is on the **server, in the weekly cron**, where the
one scheduled email the product promises could not have reached more than a
handful of readers, and silently dropped the rest.

---

## Findings

### H1 — High: the Sunday letter cannot finish, and nobody is told

*Files:* `src/lib/note-cron.ts`, `src/app/api/cron/sunday-note/route.ts`,
`vercel.json`

`dispatchWeeklyLetters` walked every opted-in recipient in a single request.
Per recipient, sequentially awaited:

| | per recipient |
|---|---|
| Supabase round trips | 4 (`portfolio_owners`, `portfolios`, `holdings`, `lab_state`) |
| upstream market calls | 3 (quotes, week returns, earnings) — ×2 again when a watchlist existed |
| model call | 1, with a **22 000 ms** budget (`weekly-margus.ts:201`) |
| email send | 1 |

The route's ceiling is `maxDuration = 60`. **Three slow letters exhaust it.**

Nothing recorded who had already been written to, so when the platform
killed the function there was no resume point: everyone after the cut-off
got no letter at all, and the next attempt was seven days away. The failure
is also invisible — the function dies before it can return its own JSON, so
the run reports nothing.

**Measured, by counting what leaves the process** (`weekly-letter-batching.test.ts`,
run against the pre-fix code and then the fixed code):

| 25 recipients holding the same two tickers | before | after |
|---|---|---|
| database SELECTs | **102** | **6** |
| upstream market calls | **75** | **3** |
| recipients accounted for when the budget runs out | 0 — killed | 5 sent, **20 reported `remaining`** |

The read count is the finding stated exactly: `2 + 4N`. After the fix it is
flat at 6 whether the list holds 1 reader or 25.

*Severity:* **High.** Not a data or safety problem, but the Sunday letter is
described in `AGENTS.md` as *the* scheduled email, and it had a working
ceiling somewhere around three or four readers.

*Fix:* see the fix log — batched reads, one shared round of market calls for
the whole run, a run deadline that returns instead of dying, and a
`note_sunday_sent_at` marker so a truncated run resumes.

### M1 — Medium: the empty-book nudge has the same shape, bounded

*File:* `src/lib/empty-book-nudge.ts`

Two queries per candidate against a `EMPTY_BOOK_NUDGE_BATCH = 40` cap — up
to 80 round trips. Graded **Medium, not High**, and the reason matters: this
one already had a sent marker (`empty_book_nudge_sent_at`, migration 046)
and runs daily, so a truncated run genuinely resumes tomorrow. It was slow,
not lossy. Batched anyway: 3 reads for the whole run.

---

## What passed, with evidence

Recorded so a future round does not re-derive it from nothing.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Server-only libraries leaking into the client bundle | **Pass** | `yahoo-finance2`, `stripe`, `@ai-sdk/openai`: 0 client chunks each. The `resend` hit was a false positive — Supabase Realtime's own `resend()` method |
| 2 | Client-component sprawl | **Pass** | Only 2 of 15 `page.tsx` are `"use client"`, both join pages that must read a token from the URL |
| 3 | Missing `loading.tsx` | **Pass — and this is the one a grep gets wrong** | Zero `loading.tsx` files, which looks alarming. But **no page is an async server component** — all 15 render a synchronous shell around a client component. There is no server fetch to suspend on, so a `loading.tsx` would never fire. The skeletons that matter are the client-side ones, and those exist |
| 4 | Prefetching | **Pass** | `WorkspaceShell` prefetches `/communities`, `/upside-portfolio`, `/account` and the first community after mount; `CommunitiesList` warms its own row cache |
| 5 | Interaction feedback | **Pass** | 17 components hold explicit pending/saving state; every mutating button disables while in flight. No `useOptimistic`, but the mutation pattern is local-state-first, so the UI does not wait on the round trip |
| 6 | N+1 candidates that turned out not to be | **Pass** | 5 of 8 flagged loops are in-memory only, each followed by a single batched `.in()`: `portfolios/route.ts:96`, `communities/[id]/book/route.ts:227`, `communities/[id]/members/[userId]/route.ts:82`. `holdings/route.ts:211` is a bounded optimistic-concurrency retry, not a fan-out |
| 7 | Raw `<img>` in place of `next/image` | **Pass** | None outside explicit eslint-disables |
| 8 | Runtime declarations | **Pass** | 12 of 62 routes pin `nodejs`, each one that needs a Node-only dependency (Stripe, `yahoo-finance2`, image handling). The rest correctly leave it to the default |

## Fixed during this pass and already shipped

- **The header mark was a 260 KB PNG** (878×713, drawn at ~14 px, on every
  page). On Slow 4G + 4× CPU it took 4.3 s to arrive and dominated LCP.
  Inline SVG now, ~2 KB and no request: **LCP 4752 ms → 1172 ms**, CLS 0
  both ways. Shipped in PR #60.
- **The header Upgrade button arrived after everything else**, so the top
  bar reflowed a beat late. Reserved before it resolves.

## Unable to Verify (Environment-Blocked)

Carried into Pass 11 as gaps, not passes:

1. **Real Vercel function timings for the crons.** H1's arithmetic and its
   round-trip counts are measured; the wall-clock cost of a real model call
   and a real Supabase round trip from a Vercel region is not. The fix is
   correct either way — it removes the linear growth and adds a resume
   point — but the exact number of letters one 60s run delivers in
   production is unknown from here.
2. **Core Web Vitals on the signed-in pages.** LCP was measured on the
   demo-mode shell, the only state reachable without a live Supabase
   project. Signed-in pages fetch more, so their real LCP is likely worse.

## Handed to Pass 4, not fixed here

Still Pass 4's, unchanged from Pass 2's hand-off: the public market
endpoints (`quotes`, `market/*`, `popular-tickers`) are unauthenticated and
unthrottled. H1's shared-quote change reduces the app's *own* upstream call
volume substantially, which is a real part of the same problem, but the
caching strategy that makes the cache the primary read path belongs to
Pass 4.
