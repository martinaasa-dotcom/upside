-- Self-reported experience tier, set via a short onboarding questionnaire
-- (shown once to new AND existing users until answered) and changeable
-- later from Account. Drives which tabs/panels default to visible so the
-- app doesn't dump every feature on someone who just wants the basics.
alter table public.portfell_profiles
  add column if not exists experience_tier text
    check (experience_tier in ('novice', 'investor', 'advanced'));
