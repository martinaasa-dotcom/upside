# Accounts, ownership, and communities

## Product model

- **My book**: Google-signed-in users own their portfolios (`portfell_portfolios.owner_id`).
- **Communities**: members see each other’s **entire book** live, **read-only**.
- Sheet PIN/password remains an **optional extra lock** on top of ownership (not primary auth).
- Guest `/?share=TOKEN` links stay time-limited external read-only views of the **creator’s** book.

## Seed ownership (test circle)

| Email | Portfolios |
|-------|------------|
| `martin.aasa@upthink.ee` | Aasad, Anu, MaryAnn |
| Seed row / `UPSIDE_SEED_KARUD_EMAIL` | Karud |
| Seed row / `UPSIDE_SEED_LAP_EMAIL` | Lap |

Claims run on `/auth/callback` and on `GET /api/portfolios` via `ensureProfileAndClaims`.

- Preferred: `SUPABASE_SERVICE_ROLE_KEY` on Vercel (API writes + env-based Karud/Lap).
- Fallback: RPC `portfell_claim_seed_for_me()` (migration `010`) using the user session — covers DB `portfell_seed_claims` without a service key.

One-shot SQL: `scripts/seed-ownership.sql`.

Seed members are auto-added to **Upside Circle**. Martin is admin.

## Enable Google Auth (Supabase)

1. Supabase → **Upthink Platform** → Authentication → Providers → **Google** → enable.
2. Create OAuth credentials in Google Cloud Console (Web application).
3. Authorized redirect URI: `https://jwjezdgggrgdgfsovgtx.supabase.co/auth/v1/callback`
4. Redirects: production `/auth/callback` + `http://localhost:3000/auth/callback`
5. Vercel env: `NEXT_PUBLIC_SUPABASE_*`, strongly recommend `SUPABASE_SERVICE_ROLE_KEY`; optional `UPSIDE_SEED_KARUD_EMAIL` / `UPSIDE_SEED_LAP_EMAIL`

## Migrations

- `008` profiles + ownership + communities + RLS
- `009` share links `created_by`
- `010` `portfell_claim_seed_for_me()` RPC

## PIN notes

Writes require signed-in owner, then optional sheet PIN. Legacy global lab row `id = 'book'` remains; personal lab uses owner uuid.
