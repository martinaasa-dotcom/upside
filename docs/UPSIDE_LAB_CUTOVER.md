# Upside Lab cutover

Code is pointed at **upsidelab.app** and a dedicated Supabase instance (env-only). Table names stay `portfell_*` so existing rows, RLS, and localStorage locks keep working.

This is not a Shopify app. There is no Partner Dashboard and no `shopify.app.toml`.

## Database isolation

The live app still talks to whichever project `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` name. Today that is the shared Upthink Platform project (`jwjezdgggrgdgfsovgtx`). Cutover is:

1. Create a new Supabase project named **Upside Lab** in the same org (eu-north-1).
2. Apply `scripts/export-upside-schema.sql` (concatenated migrations, in order) on the empty project.
3. Dump data from the old project (`pg_dump --data-only --schema=public`) and restore into the new one. Include `auth.users` / `auth.identities` if you want existing Google logins to keep working, or ask people to sign in again.
4. Copy Storage buckets only if any exist (this app does not use Storage today).
5. Point env at the new URL + anon + service role keys. Restart.

Do not rename `portfell_*` tables.

RLS is enabled on every `portfell_*` table. Holdings and portfolios are scoped to co-owners; community members get read access to books pinned into a community they belong to. Writes to someone else's book stay denied.

## Domain

Canonical host: `upsidelab.app`. Known legacy hosts 301 to it (path + query kept). `/api/*` is not redirected, so Vercel cron and signed callbacks do not drop a body.

### DNS / Vercel (do this before the 301 matters)

- Buy/configure `upsidelab.app` and add it as the production domain in Vercel.
- Point the apex + `www` at Vercel.
- Set production env:
  - `UPSIDE_CANONICAL_HOST=upsidelab.app`
  - `NEXT_PUBLIC_SITE_URL=https://upsidelab.app`
  - `OPENROUTER_HTTP_REFERER=https://upsidelab.app`
  - `OPENROUTER_APP_TITLE=Upside Lab Assistant Margus`
- After DNS is live, the old alias `upside-upthink-solutions.vercel.app` 301s to `upsidelab.app`.

### Google Cloud OAuth

In the Google Cloud console, authorized redirect URIs must include:

- `https://upsidelab.app/auth/callback`
- `https://<new-supabase-ref>.supabase.co/auth/v1/callback`

Keep the old URIs until the cutover is confirmed, then remove them.

### Supabase Auth URL config

On the dedicated project: Site URL `https://upsidelab.app`. Redirect allow-list:

- `https://upsidelab.app/**`
- `https://upsidelab.app/auth/callback`
- `http://localhost:3000/**` for local.

Google provider: Client ID / secret from the same OAuth app.

## What this repo does not do for you

- Create the new Supabase project or copy production rows (needs a dump window).
- Register `upsidelab.app` DNS or the Vercel domain.
- Update Google Cloud OAuth clients.
- Provision `privacy@upsidelab.app` (legal pages now point there).
- There is no Shopify app to reconfigure.
