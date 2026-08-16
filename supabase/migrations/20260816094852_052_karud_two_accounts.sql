-- Rasmus and Karoliine are two Circle members who share Karud, the same
-- way Martin and Amanda share Aasad. Seed claims stay so both still
-- land on that book. Drop the alias that folded them into one person.

delete from public.portfell_account_aliases
where lower(alias_email) = 'karukaroliine99@gmail.com'
  and lower(primary_email) = 'rasmusmarjapuu@gmail.com';
