-- Harden portfell_* RLS: close self-escalation + public data leaks found in audit.
-- Applied to Upthink Platform via MCP; kept here for repo history.

-- 1) portfell_portfolio_owners INSERT allowed `user_id = auth.uid()` unconditionally,
--    letting any signed-in stranger self-grant co-ownership of ANY portfolio via a
--    direct REST call. The app only ever writes this table via service role or the
--    portfell_claim_seed_for_me() security-definer RPC (both already bypass RLS),
--    so restricting to existing co-owners has no functional impact.
drop policy if exists "portfell_portfolio_owners_insert" on public.portfell_portfolio_owners;
create policy "portfell_portfolio_owners_insert" on public.portfell_portfolio_owners
  for insert with check (public.portfell_is_portfolio_co_owner(portfolio_id));

-- 2) portfell_book_snapshots was world-readable (`using (true)`) via the public anon
--    key, exposing full historical portfolio payloads (cash, holdings, buy prices)
--    for every user. The app only reads this table server-side via service role
--    (/api/snapshots); restrict direct API access to superadmins.
drop policy if exists "portfell_snapshots_select" on public.portfell_book_snapshots;
create policy "portfell_snapshots_select" on public.portfell_book_snapshots
  for select using (public.portfell_is_superadmin());

-- 3) portfell_lab_state let anyone read the legacy shared id='book' row regardless
--    of ownership (dead code path — nothing reads that id anymore). Scope strictly
--    to the signed-in owner.
drop policy if exists "portfell_lab_state_select" on public.portfell_lab_state;
create policy "portfell_lab_state_select" on public.portfell_lab_state
  for select using (owner_id = auth.uid());

-- 4) Invite SELECT policies compared two nullable emails via coalesce-to-'', so an
--    invite with a NULL email (the common "shareable link, no email lock" case)
--    matched ANY caller — including anon — because coalesce(null,'') = coalesce(null,'').
--    Require both sides to be non-null before comparing.
drop policy if exists "portfell_community_invites_select" on public.portfell_community_invites;
create policy "portfell_community_invites_select" on public.portfell_community_invites
  for select using (
    public.portfell_is_community_admin(community_id)
    or (
      email is not null
      and (auth.jwt() ->> 'email') is not null
      and lower(email) = lower(auth.jwt() ->> 'email')
    )
  );

drop policy if exists "portfell_portfolio_invites_select" on public.portfell_portfolio_invites;
create policy "portfell_portfolio_invites_select" on public.portfell_portfolio_invites
  for select using (
    public.portfell_is_portfolio_co_owner(portfolio_id)
    or (
      email is not null
      and (auth.jwt() ->> 'email') is not null
      and lower(email) = lower(auth.jwt() ->> 'email')
    )
  );
