# Upside

Multi-portfolio tracker (formerly the Google Sheets **Portfell** book) — live Yahoo Finance prices, yield/strike targets, and automated covered-call scanning (14D · 12–20% OTM · ~5% 2-weekly yield).

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Works immediately in **local demo** mode (data in `localStorage`), seeded with the Aasad / Anu / MaryAnn / Karud tabs.

Production: [https://upside-upthink-solutions.vercel.app](https://upside-upthink-solutions.vercel.app)

## Supabase (shared Upthink Platform DB)

Uses the existing **Upthink Platform** project with prefixed tables (`portfell_portfolios`, `portfell_holdings`) so it sits beside Gifttier/WrapTier/ShipTier.

1. Tables are created via `supabase/migrations/003_portfell_upthink.sql` (already applied on Upthink).
2. Copy `.env.example` → `.env.local` and set the Upthink URL + anon key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://jwjezdgggrgdgfsovgtx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

3. Restart `npm run dev`. The dashboard badge shows **Supabase** when connected.

Without these env vars the app stays in **local demo** mode (`localStorage`).

Friends on the same Vercel deploy share one live book (open RLS for personal use — add auth before a public audience).

## Features

| Section | Behavior |
|--------|----------|
| **Portfolio table** | Holdings + cash, ROI %, ROI $, % of total, 90-day sparkline, change today |
| **Yield & strike** | Live spot, EOY target, expected gain, 2-weekly yield & premium from options scan |
| **Covered calls** | Scans ~14-day expiries for 12–20% OTM strikes targeting ~5% yield |
| **Strategy card** | Your matrix rules (green rebound, 14D, OTM band, 16:45–18:00 EEST) |
| **Tabs** | Switch portfolios; add/edit/delete holdings via modal |

## API routes

- `GET /api/quotes?tickers=NBIS,RKLB` — live quotes + 90-day history
- `POST /api/options/scan` — covered-call candidate scan
- `GET /api/portfolios` — portfolios + holdings (Supabase or demo)
- `POST|PATCH|DELETE /api/holdings` — CRUD when Supabase is configured

## Assistant Margus (OpenRouter)

Add to `.env.local`:

```env
OPENROUTER_API_KEY=your_key_here
MODEL=google/gemma-4-26b-a4b-it:free
# or: MODEL=nvidia/nemotron-3-super-120b-a12b:free
```

Get a key at [openrouter.ai/keys](https://openrouter.ai/keys). Restart `npm run dev`.

Optional Groq fallback: set `GROQ_API_KEY` instead (OpenAI-compatible at `https://api.groq.com/openai/v1`).

The **Assistant Margus** chat can explain the book and change Call % via tools — the table updates live.




- `yahoo-finance2` runs in Node API routes (`serverExternalPackages`).
- If Yahoo is rate-limited or a ticker has no options chain, the app falls back to synthetic quotes/strikes so the UI stays usable.
- RLS policies in the migration are open for personal use — add auth before exposing publicly.
