# Accounts, ownership, and communities

## Product model

- **My book**: Google-signed-in users co-own portfolios via `portfell_portfolio_owners` (many users ↔ many portfolios). Full live read **and** write for every co-owner.
- `portfell_portfolios.owner_id` remains as optional primary/creator hint; **authorization uses the junction table**.
- **Communities**: members see each co-owner’s book live, **read-only**.
- Sheet PIN/password and guest share links are **removed** — Google session + co-ownership is the only gate.

## Seed ownership (test circle)

| Email | Portfolios |
|-------|------------|
| `martin.aasa@upthink.ee` | Aasad, Anu, MaryAnn |
| `aasamartinaasa@gmail.com` | Aasad, Anu, MaryAnn |
| `amandalucas400@gmail.com` | Aasad, Anu, MaryAnn |
| `rasmusmarjapuu@gmail.com` | Karud |
| `karukaroliine99@gmail.com` | Karud |
| `liinaanette@gmail.com` | Lap |

Multiple emails can map to the **same** `portfolio_slug` in `portfell_seed_claims` for co-ownership.

Claims: `/auth/callback` + `GET /api/portfolios` via `ensureProfileAndClaims` → junction insert.

- Preferred: `SUPABASE_SERVICE_ROLE_KEY` on Vercel.
- Fallback: RPC `portfell_claim_seed_for_me()`.

Ops SQL: `scripts/seed-ownership.sql`.

Add co-owner after both users exist: `POST /api/portfolios/:id/owners` `{ "email": "…" }` (caller must already co-own), or mint an invite from **My account**.

## My Account (`/account`)

- **Community profile**: `display_name`, `bio`, `avatar_url` via `PATCH /api/auth/me` — shown on community member lists.
- **Portfolio invites**: mint shareable codes/links (`POST /api/portfolios/:id/invites`). Partner accepts at `/account/join?code=…` (`POST /api/portfolios/join`). Optional email locks the invite; if they already have a profile, Account tries direct co-owner add first.

## Superadmin

Hard-coded emails (`src/lib/auth/superadmin.ts`):

- `martin.aasa@upthink.ee`
- `aasamartinaasa@gmail.com`

UI: `/admin` (also in the workspace switcher). API: `GET /api/admin/overview` (403 otherwise).

Data via `portfell_superadmin_overview()` (migration `015`) when no service role; service-role path if `SUPABASE_SERVICE_ROLE_KEY` is set.

Shows every Upside profile (Google sign-ins), every community, and each community’s members/roles.

## Migrations

- `008` profiles + ownership + communities + RLS  
- `009` share links `created_by` (dropped in `013`)  
- `010` claim RPC (superseded claim body in `011`)  
- `011` `portfell_portfolio_owners` + co-owner RLS  
- `012` profile `bio` + `portfell_portfolio_invites`  
- `013` drop sheet `access_secret_hash` + `portfell_share_links`  
- `014` community members RLS recursion fix  
- `015` superadmin overview RPC  

Writes require a signed-in **co-owner** only.
