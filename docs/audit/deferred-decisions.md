# The four decisions left open, and what was decided

Each of these was deliberately not decided during the audit, because each
turned on something only Martin knew or only production could answer. He
delegated them on 2026-08-21 and supplied the one missing fact (backups go
to Cloudflare R2).

---

## 1. Rewrite migration `001` to stop creating the legacy tables?

**No. Verified unnecessary rather than assumed so.**

`001` creates `portfolios`, `holdings` and `covered_call_targets` with
`for all using (true) with check (true)`. Production never had them, so the
only environments affected are ones built by replaying migrations: a
Supabase branch, a local reproduction, a recovery-from-migrations.

Editing an applied migration is the thing this repo's own
`ZERO_DOWNTIME_MIGRATIONS.md` warns against — *"Do not `git revert` SQL that
already ran"* — and the same logic covers editing it in place. The question
was whether the chain heals itself without that.

**It does.** Replayed end to end on Postgres 16:

```
after 001 alone, as anon:      can read portfolios: 5     <- the exposure
after the full chain, as anon: ERROR: relation does not exist
                authenticated: ERROR: relation does not exist
  public schema legacy tables: (none)
  rows preserved in archive:   5
```

`001` opens the hole, `20260821120000` revokes, `20260821160000` moves the
tables out of the API-exposed schema. A fresh environment ends up safe with
its seed rows intact, and the only window where the tables are reachable is
*during the migration run itself* — not a live-serving window.

So the permanent fix already exists; it just lives in two later files rather
than in `001`. Leaving `001` untouched keeps applied history honest.

## 2. Name the backup storage provider in the privacy policy?

**Yes — Cloudflare R2, now that it is confirmed in use.**

It was the only processor the policy did not name. I would not name one
speculatively, because a policy that lists a provider you do not use is its
own inaccuracy, and `DR_S3_*` is environment-gated so the code cannot say.
With the fact supplied, the bullet is written:

> **Cloudflare (R2)**: storage for the encrypted backup copy described under
> "Data retention". The copy is encrypted before it leaves us, so Cloudflare
> stores bytes it cannot read.

The second sentence matters as much as the first. Naming a processor without
saying what it can see invites the reader to assume the worst.

## 3. Movers' ragged final row (F-Med-3)

**Fixed: five cards became six.**

Five in a two-column grid left the last row with a single card beside a gap.
The finding itself proposed an even count. Six fills three complete rows and
is the right shape for the block anyway — the names that moved most, up and
down.

## 4. Mobile Movers loses the comparison (F-Med-4)

**Fixed, but not the way the report suggested.**

The suggestion was a horizontal snap rail. That trades a scrolling problem
for a discoverability one: it hides half your movers behind a gesture with
no affordance, on the surface whose entire job is *comparison*.

Two columns on the phone as well, which was rejected during the original
pass on the assumption the tiles would be too cramped. **Measured instead of
assumed** — rendered against the real stylesheet at three real phone widths:

| viewport | tile width | clipped |
|---|---|---|
| 360 px | 151 px | no |
| 390 px | 166 px | no |
| 430 px | 186 px | no |

Six tiles land in three tidy rows with the gainers and losers on screen
together. Padding is `p-4` on phones and `p-6` from `sm` up, which is what
buys the room.

Worth noting the first attempt at this was wrong and the rendering caught
it: `xs:grid-cols-2` looked right in the source and does nothing on a phone,
because `--breakpoint-xs` is 30rem — 480px, wider than every handset in the
table above. Reading the class would have shipped a no-op.
