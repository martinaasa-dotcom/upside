-- The composed X post for each fund report, saved whether or not it is
-- ever sent.
--
-- The text used to be built inside the cron purely to hand to the X
-- client and was discarded if the send didn't happen — so with
-- auto-posting off there was no way to post the day's update by hand:
-- it only ever existed inside a request that had already finished.
-- Storing it makes manual posting possible and makes turning
-- auto-posting on later a no-op for what gets written.
--
-- Nullable on purpose: every report written before this column existed
-- has no post text, and backfilling one would mean inventing a number
-- for a day nobody posted.
alter table public.portfell_margus_fund_reports
  add column if not exists x_post text;

comment on column public.portfell_margus_fund_reports.x_post is
  'Composed daily X post. Saved even when auto-posting is off (X_POSTING_ENABLED unset) so it can be posted manually.';
