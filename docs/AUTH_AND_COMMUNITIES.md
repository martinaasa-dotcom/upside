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
| `UPSIDE_SEED_KARUD_EMAIL` | Karud |
| `UPSIDE_SEED_LAP_EMAIL` | Lap |

Claims run on `/auth/callback` via `ensureProfileAndClaims`. Unclaimed rows (`owner_id IS NULL`) are assigned on first matching sign-in.

Seed members are auto-added to **Upside Circle** (`a0000000-0000-4000-8000-000000000001`). Martin is admin.

## Enable Google Auth (Supabase)

1. Supabase → **Upthink Platform** → Authentication → Providers → **Google** → enable.
2. Create OAuth credentials in Google Cloud Console (Web application).
3. Authorized redirect URI:

   `https://jwjezdgggrgdgfsovgtx.supabase.co/auth/v1/callback`

4. Site URL / additional redirects in Supabase Auth settings:

   - `https://upside-upthink-solutions.vercel.app`
   - `https://upside-upthink-solutions.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`

5. Vercel env (already used):

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (API writes + claim script)
   - Optional: `UPSIDE_SEED_KARUD_EMAIL`, `UPSIDE_SEED_LAP_EMAIL`
   - `UPSIDE_OWNER_PIN` — admin override for locked sheets only

## Migrations

- `008_auth_ownership_and_communities.sql` — profiles, `owner_id`, lab per user, communities/members/invites, RLS
- `009_share_links_created_by.sql` — guest links scoped to creator

## App routes

| Path | Purpose |
|------|---------|
| `/` | My book (SSO gate unless `?share=`) |
| `/auth/callback` | OAuth code exchange + seed claim |
| `/communities` | List / create |
| `/communities/[id]` | Aggregate overview + drill-down + admin invites |
| `/communities/join?token=` | Accept invite |

## PIN deprecation notes

- Writes require a signed-in **owner**, then optional sheet PIN via `requireOwnerAccess`.
- Book-wide master PIN is no longer required to mint guest links (ownership is enough).
- Global `portfell_lab_state` row `id = 'book'` is legacy; personal lab uses `id = owner uuid` + `owner_id`.
