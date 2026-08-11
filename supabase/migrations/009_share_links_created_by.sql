-- Scope guest share links to the creating owner's book
alter table public.portfell_share_links
  add column if not exists created_by uuid references public.portfell_profiles(id) on delete set null;

create index if not exists portfell_share_links_created_by_idx
  on public.portfell_share_links(created_by);
