<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Upside agent notes

- Product name is **Upside** (UI, metadata, docs). Legacy `portfell_*` table names and `portfell-*` localStorage keys stay as-is so the shared book / Save lock don’t break.
- **Do not invent or “fix” Aasad holdings** unless Martin pastes a new sheet. Canonical Aasad: cash −7000; NBIS 500@109.96; CRWV 1100@83.27; RKLB 200@68.65; BMNR 1500@18.20; VST 200@145. No NVDA/AVGO on Aasad.
- **Call % house baselines** (vol guidance): VST ~7%, BMNR ~15%, RKLB ~16%, CRWV ~18%, NBIS ~22%. Stock-target baselines: CRWV 90, NBIS 205, BMNR 19.50, VST 145, RKLB 77. See `CALL_PCT_BASELINES` / `STOCK_TARGET_BASELINES` in `src/lib/calculations.ts`.
- Respect `localStorage` key `portfell-locked` and `data/locked-demo.json`. Never delete the lock. Prefer asking Martin to hit **Save** rather than bumping `portfell-demo-v*` to force a reseed.
- Production data lives on the shared **Upthink Platform** Supabase project in `portfell_portfolios` / `portfell_holdings` (not a separate Supabase project).
- After every push/prod deploy: verify Vercel production SHA matches `git rev-parse HEAD` before telling Martin it’s live (see `.cursor/rules/vercel-live-matches-push.mdc`).
- No Milestones sheet in the seed.