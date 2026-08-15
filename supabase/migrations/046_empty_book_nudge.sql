-- One-time "your book is empty" nudge. Null means not sent yet.
alter table public.portfell_profiles
  add column if not exists empty_book_nudge_sent_at timestamptz;

comment on column public.portfell_profiles.empty_book_nudge_sent_at is
  'When we sent the one-time empty-book encouragement. Null means not sent.';
