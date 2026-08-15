-- Teacher-set class plan: what students may do, and when.
-- Empty plan means anything goes, so existing classes stay open.

alter table public.portfell_communities
  add column if not exists class_plan jsonb not null default '{}'::jsonb;

comment on column public.portfell_communities.class_plan is
  'Classroom only. Periods with kind buy/closed/fix/open plus optional purpose. Empty = students can do anything.';
