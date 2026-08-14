# Upside

A daily read of your book, with Margus to think it through. Live prices, Thesis Pulse, and an open paper fund (Upside Fund). Communities are optional.

Production: [https://upside-upthink-solutions.vercel.app](https://upside-upthink-solutions.vercel.app)

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Without Supabase env vars it runs in local demo mode (`localStorage`).

## What you get

- **My book** — sheets of holdings, cost basis, today's move
- **Pulse** — thesis check on your largest names, plus anything down 5%
- **Lab** — allocation, risk shocks, weekly trends, seasonality
- **Compound** — growth planner seeded from what you actually hold
- **Margus** — chat that can read and edit the sheet (screenshot or CSV import too)
- **Fund / Communities / Account** — side rooms in the header, not extra home-screen heroes

Not financial advice. Pulse, Forecast, and Margus are educational scenario tools.

## Auth and data

Google SSO. Shared books use co-ownership (`portfell_portfolio_owners`). Communities are opt-in only: invite or an admin-approved join request. Never auto-join on sign-in.

Production data lives on the shared Upthink Platform Supabase project (`portfell_*` tables).

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENROUTER_API_KEY=...
```

See `.env.example` for the full list. Market data uses Yahoo first, then optional Twelve Data / Finnhub keys. If every provider misses a ticker, the last cached price stays on screen. We do not invent a mark.

## Scripts

```bash
npm run lint
npm run typecheck
npm run test:invariants
```
