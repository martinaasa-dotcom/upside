-- Community members can see co-ownership rows for peers in the same circle.
-- Without this, the communities API (session client, no service role) could not
-- attribute pinned sheets like Lap to signed-in members — they stayed "awaiting sign-in".

drop policy if exists "portfell_portfolio_owners_select" on public.portfell_portfolio_owners;

create policy "portfell_portfolio_owners_select" on public.portfell_portfolio_owners
  for select using (
    user_id = auth.uid()
    or public.portfell_is_portfolio_co_owner(portfolio_id)
    or public.portfell_shares_community_with(user_id)
  );
