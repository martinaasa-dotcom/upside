-- Admin copy of a live invite needs the raw token. Join still uses
-- token_hash. Null on links minted before this column existed.

alter table public.portfell_community_invites
  add column if not exists token text;

comment on column public.portfell_community_invites.token is
  'Raw invite token so an admin can copy the live URL again. Join still looks up token_hash.';
