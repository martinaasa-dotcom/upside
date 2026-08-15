-- Classroom circles: a teacher-run private class with identical paper sheets.
-- Membership is still invite-only. Signing in never auto-joins anyone.
-- Each student gets one homework sheet, isolated from any real book.

alter table public.portfell_communities
  add column if not exists kind text not null default 'circle';

alter table public.portfell_communities
  drop constraint if exists portfell_communities_kind_check;

alter table public.portfell_communities
  add constraint portfell_communities_kind_check
  check (kind in ('circle', 'classroom'));

alter table public.portfell_communities
  add column if not exists starting_cash numeric not null default 100000;

alter table public.portfell_communities
  drop constraint if exists portfell_communities_starting_cash_check;

alter table public.portfell_communities
  add constraint portfell_communities_starting_cash_check
  check (starting_cash >= 1000 and starting_cash <= 10000000);

alter table public.portfell_communities
  drop constraint if exists portfell_communities_classroom_private;

alter table public.portfell_communities
  add constraint portfell_communities_classroom_private
  check (kind <> 'classroom' or visibility = 'private');

comment on column public.portfell_communities.kind is
  'circle is the usual league. classroom is a teacher-run paper class.';

comment on column public.portfell_communities.starting_cash is
  'Paper cash given to each student sheet when they join a classroom.';

alter table public.portfell_portfolios
  add column if not exists classroom_community_id uuid
    references public.portfell_communities(id) on delete set null;

create unique index if not exists portfell_portfolios_one_class_sheet
  on public.portfell_portfolios (classroom_community_id, owner_id)
  where classroom_community_id is not null and owner_id is not null;

comment on column public.portfell_portfolios.classroom_community_id is
  'If set, this sheet is the homework book for that class. Isolated from the owner''s real book.';
