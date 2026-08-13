-- Community admins can already rename via the existing
-- portfell_communities_update policy (portfell_is_community_admin), but
-- there was no DELETE policy at all, so removing a community outright had
-- no RLS-level path (only worked if a caller happened to be on the
-- service-role client). Add it explicitly, mirroring the update policy,
-- so "delete this community" is safe even if the service-role key is ever
-- unset and the app falls back to the caller's own session.
drop policy if exists "portfell_communities_delete" on public.portfell_communities;
create policy "portfell_communities_delete"
  on public.portfell_communities
  for delete
  using (public.portfell_is_community_admin(id));
