# Pass 3 — Performance fix log (Round 2)

Companion to `docs/audit/03-performance.md`. One row per finding.
**No row is Resolved without fresh re-verification by the method that
surfaced it.**

| # | Finding | Severity | Status | Attempts | Evidence |
|---|---|---|---|---|---|
| P0 | 260 KB PNG logo dominating LCP | High | **Resolved** | 1 | Throttled re-measure: LCP 4752 ms → 1172 ms (shipped in PR #60) |
| H1 | Sunday letter cannot finish and silently drops the rest | High | **Resolved** | 1 | Round trips counted before and after — 102 → 6 SELECTs, 75 → 3 market calls, 25 recipients accounted for instead of 0 |
| M1 | Empty-book nudge issues 2 queries per candidate | Medium | **Resolved** | 1 | Same instrument: up to 80 reads → 3 |

## H1 — measured with a counter, not with a claim

The claim under test was "cost grows with the mailing list." Rather than
argue it from the source, `src/lib/weekly-letter-batching.test.ts` fakes the
Supabase client, the mailer, the market layer and the model, and **counts
what leaves the process** for 25 recipients who hold the same two tickers.

Run against `origin/main` (pre-fix):

```
reads for 25 recipients ....... 102   (2 + 4N, exactly as read from source)
upstream market calls .......... 75   (3 per recipient)
letters delivered before the
  budget ran out ................. attempted all 25, no stop, no marker
```

Run against the fix, same test file, unchanged:

```
reads for 1 recipient ........... 6
reads for 25 recipients ......... 6   <- flat
upstream market calls ........... 3   quotes:NVDA,MSFT / week:… / events:…
letters when each costs 10s of
  the 50s budget ................ 5 sent, 20 returned as `remaining`
```

Four changes, each closing a distinct part of the failure:

1. **Batched reads.** The four per-recipient queries became four batched
   `.in()` queries for the whole run, assembled into maps and joined in
   memory. This is what turns `2 + 4N` into a constant.
2. **One round of market calls for everyone.** Two readers holding NVDA used
   to mean two NVDA quote requests. The union of every recipient's holdings
   and watchlist is quoted once, then each letter is handed its own slice.
   Worth stating plainly given the brief's rules: this **reduces** load on
   the free-tier providers. It is not an attempt to get more quota — it asks
   for less.
3. **A run deadline.** `RUN_BUDGET_MS = 50_000` against the route's
   `maxDuration = 60`, and no new letter starts with under `MIN_LETTER_MS`
   left. The run now returns its own JSON — including a truthful
   `remaining` — instead of being killed mid-send. `writeWeeklyTake` also
   takes a `budgetMs` now, so a single letter can never spend 22s of a
   budget that has 9s left.
4. **A resume point.** `note_sunday_sent_at` (migration
   `20260821150000_sunday_letter_sent_marker.sql`), mirroring
   `empty_book_nudge_sent_at` from 046. Stamped after each successful send;
   a recipient stamped inside the last three days is skipped. Two extra
   Sunday cron entries (04:20, 04:40) pick up whoever the 04:00 run did not
   reach, and are harmless no-ops once it did.

**One thing that had to be got right and nearly wasn't:** the marker would
have broken testing. `noteTestAudience` sends any non-cron hit only to
Martin, so hitting the route on Saturday to check the letter would have
stamped him and made Sunday's real run skip him. A targeted send is a test
by definition, so it now ignores the marker and does not write one.

Also verified:

- **Idempotent.** A second run immediately after a complete one sends 0 and
  skips everyone, because every recipient carries a fresh stamp.
- **Nobody is lost.** `sent + skipped + remaining === optedIn` is asserted,
  which is the property the old code could not satisfy.
- **The stamp is written before the count.** A send this run cannot prove
  stays unmarked, so a resumed run retries it rather than assuming it landed.

## M1 — closed for the right reason

Batched the same way, but recorded honestly as the lesser problem: this cron
was already capped at 40 candidates, already had a sent marker, and already
ran daily, so a truncated run resumed on its own. It was 80 round trips
where 3 would do — wasteful, not lossy.

## Unable to Verify (Environment-Blocked)

1. **Real production timings.** The round-trip counts are exact; the
   wall-clock cost of a real model call and a real Supabase query from a
   Vercel region is not measurable from here, so how many letters one 60s
   run actually delivers in production is unknown. What is now guaranteed
   regardless of that number is that the run stops cleanly and the next one
   continues.
2. **The migration against the real database.** Written to mirror 046 and
   guarded with `if not exists`, but applied only locally.

## Deliberately not changed

- **No `loading.tsx` files added.** The audit's own check explains why: no
  page is an async server component, so there is nothing for one to suspend
  on. Adding them would be cargo cult.
- **No `useOptimistic`.** The mutation pattern already updates local state
  first and reconciles after; introducing a second mechanism for the same
  job would add surface without changing what the user sees.
