# Pass 9 — Compliance: fix log

One row per finding in [`09-compliance.md`](09-compliance.md). Status is
**Resolved**, **Deferred**, or **Stuck**. Nothing is marked Resolved
without fresh re-verification evidence attached.

Checks run after the fixes in this log: `npx tsc --noEmit` clean,
`npx eslint --max-warnings 0` clean on every touched file, `npm run test`
111/111 (including a new assertion for the added export section),
`npm run test:invariants` at its 2 pre-existing failures.

| # | Finding | Severity | Status | Evidence | Notes |
|---|---|---|---|---|---|
| H1 | R2 disaster-recovery cold copies have no retention policy and are never purged for a deleted account | High | **Deferred — needs Martin's decision** | — | Genuinely a decision, not a fix: how long an encrypted whole-book cold copy should live, and by what mechanism (a Cloudflare bucket lifecycle rule, or a prune step in the `disaster-recovery` cron). Picking a number unilaterally would put a retention promise in the Privacy Policy that nobody agreed to. Partially mitigated on `main` since this pass ran — 7d29e60 bounded R2 cold-copy retention to 90 days — but the deleted-account purge path is still open. This is item #1 in `00-summary.md`'s decision list and stays there. |
| M1 | Privacy policy didn't disclose the R2 cold-copy channel | Medium | **Resolved** (Pass 10) | Pass 10 §Medium 1 | Handed to Pass 10 by design (a document change, not a compliance-code one) and closed there, disclosing the channel accurately without inventing a duration that doesn't exist. |
| M2 | GDPR export omitted `portfell_community_invite_uses` | Medium | **Resolved** | `src/lib/gdpr/user-export.ts` — added to the `UserDataExport` type, queried in the main `Promise.all` (`.select("invite_id, used_at").eq("user_id", uid)`), returned as `community_invite_uses`, and given its own `csvSection`. Covered by a new assertion in `src/lib/gdpr/gdpr.test.ts` checking both the JSON body and the CSV section carry it. | Went past the report's suggestion in one respect: it described only the query, but the export has **two** serialisations, and adding the data without a `csvSection` would have left `?format=csv` still incomplete — a partial fix that looks closed. Both formats now carry it. |
| L1 | `PulsePage.tsx`'s disclaimer was a duplicated literal instead of the shared constant | Low | **Resolved** (prior session) | Report §Low 1 — now imports `ADVICE_DISCLAIMER_SHORT` | Fixed when the pass was first run, merged to `main`. |
| L2 | Hardcoded household/alias email tables retain PII indefinitely, untouched by account deletion | Low | **Deferred** | — | Three migration-seeded allow-lists keyed by email (`portfell_household_groups`, `portfell_account_aliases`, `portfell_seed_claims`) covering five people in Martin's own family. `AGENTS.md` explicitly guards this data, no foreign key ties it to `portfell_profiles`, and the real risk today is close to zero — the mirroring and alias logic only fires against a live profile row. It becomes a genuine problem if the pattern is ever generalised beyond Martin's household, which is the direction `AGENTS.md`'s 2026-08-12 note points; flagged for that moment rather than patched now against data the project rules say not to touch. |
| — | GDPR Article 8 EU consent-age question | Needs a decision | **Deferred — needs Martin's decision** | — | Cross-checked by Pass 10 and found internally consistent: the "13 or older" sign-in gate, the Terms, and the Privacy Policy all agree. The open question is a business/legal one — whether a single global 13+ gate is right once several EU member states set the Article 8 digital-consent age as high as 16. Item #2 in `00-summary.md`'s decision list. |

## Deferred summary

Three items left unfixed, none silently. **H1** and the Article 8
question are the two genuine judgment calls this pass surfaced and both
already sit in `00-summary.md`'s decision list for Martin. **L2** is
data `AGENTS.md` explicitly rules out touching, recorded with the
condition that would make it urgent.
