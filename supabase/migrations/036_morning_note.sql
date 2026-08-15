-- Opt-in weekday morning note. Off until they ask.
alter table public.portfell_profiles
  add column if not exists morning_note boolean not null default false;

comment on column public.portfell_profiles.morning_note is
  'If true, the weekday morning cron may email a short book note.';
