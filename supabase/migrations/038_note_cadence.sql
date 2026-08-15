-- Split the single morning_note opt-in into weekday vs Sunday.
alter table public.portfell_profiles
  add column if not exists note_morning boolean not null default false,
  add column if not exists note_sunday boolean not null default false;

update public.portfell_profiles
  set
    note_morning = morning_note,
    note_sunday = morning_note
  where morning_note = true
    and note_morning = false
    and note_sunday = false;

comment on column public.portfell_profiles.note_morning is
  'Weekday morning and after-close email notes. Off until they ask.';
comment on column public.portfell_profiles.note_sunday is
  'Sunday look email. Off until they ask.';
