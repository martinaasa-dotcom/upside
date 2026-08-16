-- Karud is one household: Karoliine's Google login aliases to Rasmus
-- so Circle / community book collapse them into one person. Seed claims
-- stay so her first sign-in co-owns Karud instead of an empty book.

insert into public.portfell_account_aliases (alias_email, primary_email) values
  ('karukaroliine99@gmail.com', 'rasmusmarjapuu@gmail.com')
on conflict (alias_email) do update set primary_email = excluded.primary_email;

insert into public.portfell_seed_claims (email, portfolio_slug) values
  ('rasmusmarjapuu@gmail.com', 'karud'),
  ('karukaroliine99@gmail.com', 'karud')
on conflict do nothing;
