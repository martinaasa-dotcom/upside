-- Sunday note is the default. Weekday morning / close stay opt-in.
alter table public.portfell_profiles
  alter column note_sunday set default true;

update public.portfell_profiles
  set
    note_sunday = true,
    morning_note = true,
    updated_at = now()
  where note_sunday = false
    and note_morning = false;

comment on column public.portfell_profiles.note_morning is
  'Weekday morning and after-close email notes. Off until they ask.';
comment on column public.portfell_profiles.note_sunday is
  'Sunday look email. On by default. They can turn it off in Account.';
