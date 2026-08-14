-- Dedicated Upside Lab project: RPCs are for signed-in users (or service role).
-- Anon could hit SECURITY DEFINER functions over PostgREST on the shared hub.
revoke execute on function public.portfell_can_read_portfolio(uuid) from anon, public;
revoke execute on function public.portfell_claim_seed_for_me() from anon, public;
revoke execute on function public.portfell_create_portfolio_for_me(text) from anon, public;
revoke execute on function public.portfell_delete_my_account() from anon, public;
revoke execute on function public.portfell_is_community_admin(uuid) from anon, public;
revoke execute on function public.portfell_is_community_member(uuid) from anon, public;
revoke execute on function public.portfell_is_portfolio_co_owner(uuid) from anon, public;
revoke execute on function public.portfell_is_superadmin() from anon, public;
revoke execute on function public.portfell_lookup_profile_id_by_email(text) from anon, public;
revoke execute on function public.portfell_primary_email(text) from anon, public;
revoke execute on function public.portfell_shares_community_with(uuid) from anon, public;
revoke execute on function public.portfell_superadmin_overview() from anon, public;

grant execute on function public.portfell_can_read_portfolio(uuid) to authenticated;
grant execute on function public.portfell_claim_seed_for_me() to authenticated;
grant execute on function public.portfell_create_portfolio_for_me(text) to authenticated;
grant execute on function public.portfell_delete_my_account() to authenticated;
grant execute on function public.portfell_is_community_admin(uuid) to authenticated;
grant execute on function public.portfell_is_community_member(uuid) to authenticated;
grant execute on function public.portfell_is_portfolio_co_owner(uuid) to authenticated;
grant execute on function public.portfell_is_superadmin() to authenticated;
grant execute on function public.portfell_lookup_profile_id_by_email(text) to authenticated;
grant execute on function public.portfell_primary_email(text) to authenticated;
grant execute on function public.portfell_shares_community_with(uuid) to authenticated;
grant execute on function public.portfell_superadmin_overview() to authenticated;
