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
| H1 | R2 disaster-recovery cold copies have no retention policy and are never purged for a deleted account | High | **Resolved** | `src/lib/dr/config.ts` default is now **30 days** (was 90), pinned by `src/lib/dr/config.test.ts` so it can't drift from the published number. `docs/DISASTER_RECOVERY.md` adds the 45-day R2 lifecycle rule as a backstop and a restore obligation. Privacy policy §7 states 30 in all three places. | Decision taken: 30 days, cron prune as primary, bucket lifecycle rule at 45 days as a backstop. 30 because these copies exist to rebuild after catastrophic loss, a mass delete, or ransomware — all noticed in days, not months; 90 read as an archive, raising the GDPR bar for no operational gain. The backstop matters because the prune runs *inside* the cron, so if the cron stops the objects live forever with nothing to notice — that gap was the real risk, not the number. **Deliberately did not** attempt per-user purging of existing copies: they are whole-book encrypted blobs, so surgical erasure means decrypting, filtering and re-encrypting every backup to satisfy one deletion, with real corruption risk. The accepted position instead (EDPB/ICO both land here) is a bounded, disclosed window plus a restore that re-applies deletions — which `DISASTER_RECOVERY.md` now spells out as a required step. Two human actions remain: creating the R2 lifecycle rule (a console action) and following the restore step if a restore ever happens. |
| M1 | Privacy policy didn't disclose the R2 cold-copy channel | Medium | **Resolved** (Pass 10) | Pass 10 §Medium 1 | Handed to Pass 10 by design (a document change, not a compliance-code one) and closed there, disclosing the channel accurately without inventing a duration that doesn't exist. |
| M2 | GDPR export omitted `portfell_community_invite_uses` | Medium | **Resolved** | `src/lib/gdpr/user-export.ts` — added to the `UserDataExport` type, queried in the main `Promise.all` (`.select("invite_id, used_at").eq("user_id", uid)`), returned as `community_invite_uses`, and given its own `csvSection`. Covered by a new assertion in `src/lib/gdpr/gdpr.test.ts` checking both the JSON body and the CSV section carry it. | Went past the report's suggestion in one respect: it described only the query, but the export has **two** serialisations, and adding the data without a `csvSection` would have left `?format=csv` still incomplete — a partial fix that looks closed. Both formats now carry it. |
| L1 | `PulsePage.tsx`'s disclaimer was a duplicated literal instead of the shared constant | Low | **Resolved** (prior session) | Report §Low 1 — now imports `ADVICE_DISCLAIMER_SHORT` | Fixed when the pass was first run, merged to `main`. |
| L2 | Hardcoded household/alias email tables retain PII indefinitely, untouched by account deletion | Low | **Deferred** | — | Three migration-seeded allow-lists keyed by email (`portfell_household_groups`, `portfell_account_aliases`, `portfell_seed_claims`) covering five people in Martin's own family. `AGENTS.md` explicitly guards this data, no foreign key ties it to `portfell_profiles`, and the real risk today is close to zero — the mirroring and alias logic only fires against a live profile row. It becomes a genuine problem if the pattern is ever generalised beyond Martin's household, which is the direction `AGENTS.md`'s 2026-08-12 note points; flagged for that moment rather than patched now against data the project rules say not to touch. |
| — | GDPR Article 8 EU consent-age question | Needs a decision | **Resolved** | `src/components/SignInGate.tsx` gates on `invite?.kind === "classroom" ? 13 : 16`; Terms and Privacy state both ages; the legal invariant now asserts both numbers appear in both documents **and** that the gate enforces exactly those. | Decision taken: split by how the account is created rather than pick one number for everyone. Classroom invite → 13 (a school context: pretend money, no payment, a teacher in between — and `AGENTS.md` describes Classroom as the high-school product, so a flat 16 would lock out precisely its users). Everything else → 16, the strictest member-state threshold, which retires the per-country analysis entirely and costs almost no real users. Country-dependent gating was rejected: it needs reliable geolocation to enforce an age nobody can verify anyway. The gate starts at 16 and only relaxes once a classroom invite has resolved, so an unknown visitor sees the strict default. Still worth a lawyer's sign-off — minors plus financial content — but it is no longer an open question. |

## Deferred summary

One item left unfixed. **L2** (the hardcoded household/alias email
tables) is data `AGENTS.md` explicitly rules out touching — a five-person
family allow-list Martin maintains about his own household, where the
mirroring logic only fires against a live profile row. Recorded above
with the condition that would make it urgent: the moment that pattern is
generalised beyond his own family.

H1 and the Article 8 question — the two genuine judgment calls this pass
surfaced — are both now decided and implemented.
