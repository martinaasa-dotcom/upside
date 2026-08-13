-- Public vs private communities + a request-to-join flow for public ones.
-- Private (the default) stays exactly as it works today: invite-only.
-- Public communities become discoverable to any signed-in user, who can
-- ask to join; an admin has to approve before they get read access to
-- anyone's book.

alter table public.portfell_communities
  add column if not exists visibility text not null default 'private'
    check (visibility in ('public', 'private'));

-- Existing communities (Upside Circle included) default to private via the
-- column default above — nothing becomes newly discoverable by accident.

-- Let anyone signed-in see PUBLIC communities (name + id only, for
-- discovery) in addition to the communities they already belong to. The
-- membership half keeps using the security-definer helper from migration
-- 014 to avoid RLS recursion against portfell_community_members.
drop policy if exists "portfell_communities_select" on public.portfell_communities;
create policy "portfell_communities_select" on public.portfell_communities
  for select using (
    visibility = 'public' or public.portfell_is_community_member(id)
  );

create table if not exists public.portfell_community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.portfell_communities(id) on delete cascade,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  message text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.portfell_profiles(id) on delete set null,
  unique (community_id, user_id)
);

alter table public.portfell_community_join_requests enable row level security;

drop policy if exists "portfell_join_requests_select" on public.portfell_community_join_requests;
create policy "portfell_join_requests_select" on public.portfell_community_join_requests
  for select using (
    user_id = auth.uid() or public.portfell_is_community_admin(community_id)
  );

drop policy if exists "portfell_join_requests_insert" on public.portfell_community_join_requests;
create policy "portfell_join_requests_insert" on public.portfell_community_join_requests
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.portfell_communities c
      where c.id = community_id and c.visibility = 'public'
    )
  );

-- Two update policies, combined with OR: an admin can move any request to
-- approved/rejected; a requester can only reset their own (e.g. previously
-- rejected) request back to pending — they can never approve themselves.
drop policy if exists "portfell_join_requests_admin_update" on public.portfell_community_join_requests;
create policy "portfell_join_requests_admin_update" on public.portfell_community_join_requests
  for update using (public.portfell_is_community_admin(community_id))
  with check (public.portfell_is_community_admin(community_id));

drop policy if exists "portfell_join_requests_requester_update" on public.portfell_community_join_requests;
create policy "portfell_join_requests_requester_update" on public.portfell_community_join_requests
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "portfell_join_requests_delete" on public.portfell_community_join_requests;
create policy "portfell_join_requests_delete" on public.portfell_community_join_requests
  for delete using (
    user_id = auth.uid() or public.portfell_is_community_admin(community_id)
  );
