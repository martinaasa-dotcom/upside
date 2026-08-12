-- Options familiarity is its own flag, separate from experience_tier.
-- Someone can be an overall "advanced" investor who has never touched
-- options -- the onboarding tier (max of the two answers) would still
-- show them options UI, which is exactly backwards for that combination.
alter table public.portfell_profiles
  add column if not exists knows_options boolean;
