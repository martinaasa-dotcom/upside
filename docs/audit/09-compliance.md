# Pass 9 — Compliance (Round 2 re-audit)

**Date:** 2026-08-21 · **Base:** `1c317f6` (main, after Pass 8)

> Round 2 re-derivation. Nothing in the previous `09-compliance.md` was
> carried over as fact.

**Headline:** the two surfaces that project money forward — the growth
calculator and the bad-day simulator — carried **no framing at all**, while
Forecast, Pulse and Margus each carried theirs. And the right-of-access
export answered "what do I own?" without answering "who else can see it?"

Neither is dramatic. Both are the kind of gap that is invisible until
somebody asks the question the document is supposed to answer.

---

## Findings

### M1 — Medium: two projection surfaces had no disclaimer

`AGENTS.md` requires the not-advice framing on Margus, Thesis Pulse and
Forecast, and all three have it. But the requirement is really about
surfaces that put a number on someone's future, and two of those were
missed:

| Surface | What it shows | Framing |
|---|---|---|
| Margus chat | AI answers | `ADVICE_DISCLAIMER_SHORT` |
| Thesis Pulse | AI verdicts | `ADVICE_DISCLAIMER_SHORT` |
| Forecast | modeled price paths | `FORECAST_DISCLAIMER` |
| Sunday letter | AI paragraphs | `ADVICE_DISCLAIMER_SHORT` |
| Upside Fund | simulated portfolio | `UPSIDE_PORTFOLIO_DISCLAIMER` |
| **Scenario simulator** | "What a bad day costs you" | **none** |
| **Growth calculator** | compounded balances to a date | **none** |

The scenario simulator models a drop against the person's real holdings and
renders notes like *"Still comfortable, with $X of room before a forced
sale"* — advice-shaped output about their actual money, with nothing saying
it is a model.

The growth calculator is the more interesting of the two, because the risk
there is **not** being read as advice. It is arithmetic on numbers the
person typed, and the way it misleads is by being read as a **prediction**.
"Not personalized investment advice" does not address that at all; the
missing sentence is that the rate is an assumption.

*Severity:* Medium. Nothing here is a false statement — the surfaces are
honest about being calculators. What is missing is the sentence that stops a
reasonable person mistaking a projection for a forecast.

### M2 — Medium: the export answered half the access question

`buildUserExport` covered 12 of the 23 `portfell_*` tables. Most omissions
are correct — `margus_fund_*` and `popular_tickers` are not personal data.
Two were not:

- **`portfell_portfolio_owners`** — the record of **who else can open this
  person's sheets.** The export listed the portfolios and the holdings but
  not the co-ownership, so someone asking "who can see my holdings?" got
  the holdings and no answer.
- **`portfell_account_aliases`** — the link that ties two email addresses to
  one human. Plainly personal, and nothing else covered it.

*Severity:* Medium. GDPR Art. 15 is a right to a copy of the personal data
being processed, and co-ownership is squarely that.

### L1 — Low: an unused constant in the legal-text file

`ADVICE_DISCLAIMER_LONG` was defined and displayed nowhere.

Worth more than its severity suggests, because of where it lived. A file
whose entire purpose is "single source of truth for the framing shown to
users" invites the reader to assume each constant means some surface is
covered. An unused one is a quiet false positive in exactly the file where
you least want one.

---

## What passed, with evidence

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Account deletion is complete | **Pass** | `portfell_delete_my_account` deletes portfolios, communities (with last-admin handoff so a group is not stranded), scrubs snapshots, and deletes error-log rows explicitly. Everything else reaches it by `on delete cascade` from `portfell_profiles` |
| 2 | Deletion leaves no orphaned user rows | **Pass** | Every `user_id`/`owner_id` column either cascades or is `on delete set null` — the latter deliberately, so a shared artefact survives while ceasing to point at a person. The one column with no FK at all (`portfell_error_log.user_id`) is deleted explicitly by the RPC |
| 3 | Deleting an account cancels billing | **Pass** | Re-verified from Pass 6, where it was strengthened to ask Stripe what is live rather than trust our own mirror |
| 4 | No PII in logs | **Pass** | No `logEvent` call carries an email, display name or bio. Two `console.error` hits matched a grep for "token" and are false positives — "id token" and "first token" |
| 5 | Export excludes live credentials | **Pass** | `INVITE_SAFE_COLUMNS` deliberately omits `token` and `token_hash`. Worth noting given Pass 8 found the raw token is stored: exporting invites naively would have put working bearer links into a file people download and forward |
| 6 | Export can be encrypted | **Pass** | AES-256-GCM envelope, round-trip tested |
| 7 | Both export formats carry the same data | **Fixed during this pass** | Not true when found — see the fix log |
| 8 | Disclaimers on the three AI surfaces | **Pass** | Margus, Pulse and Forecast each carry theirs. The gap was elsewhere (M1) |
| 9 | Disclaimer wording is centralised | **Pass** | One file, imported everywhere; no literal copies |

---

## Unable to Verify (Environment-Blocked)

Carried into Pass 11:

1. **No real export run.** `buildUserExport` is exercised through its types
   and serializers, not against a live database, so the new queries are not
   confirmed to return rows.
2. **No real deletion run.** Completeness is argued from the RPC body plus
   the FK cascade definitions, not observed.
3. **Retention periods** are not defined anywhere in the codebase — how long
   snapshots, error logs and cold backups are kept is a policy question, not
   a code one, and no policy document was found to check the code against.
