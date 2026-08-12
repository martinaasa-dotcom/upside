-- A brand-new user's first "Create sheet" click was failing with
-- "new row violates row-level security policy for table portfell_portfolios".
--
-- The portfell_portfolios INSERT policy is `(owner_id = auth.uid()) or
-- (owner_id is null)` -- correct in principle, but the app performed this as
-- two separate ordinary-client calls (insert portfolio, then upsert the
-- owner row) built from two independently-constructed Supabase clients per
-- request (one from requireAuthUser(), one from getSupabaseDataClient()).
-- That's the same class of "ownership-based RLS can't cleanly express a
-- self-service first write" problem already solved elsewhere in this schema
-- via security-definer RPCs (portfell_claim_seed_for_me, invite redemption,
-- account deletion) -- auth.uid() resolves reliably inside a security
-- definer function regardless of which client/session object triggered it,
-- and running as the function owner sidesteps the per-role RLS check
-- entirely instead of depending on it matching exactly.
--
-- Bonus fixes along the way: the old two-step app code left an orphaned,
-- owner-less portfolio if the second (owner-row) write ever failed after
-- the first succeeded; and slugify() had no collision handling at all, so
-- two people independently naming a sheet "My Portfolio" would 500 on a
-- unique-constraint violation for the second one. Both fixed by making
-- this one atomic function with slug disambiguation.
create or replace function public.portfell_create_portfolio_for_me(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  base_slug text;
  new_slug text;
  suffix int := 1;
  next_sort int;
  new_row public.portfell_portfolios;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or trim(p_name) = '' then
    raise exception 'name required';
  end if;

  base_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(base_slug, '-');
  if base_slug = '' then
    base_slug := 'sheet';
  end if;
  new_slug := base_slug;

  while exists (select 1 from public.portfell_portfolios where slug = new_slug) loop
    suffix := suffix + 1;
    new_slug := base_slug || '-' || suffix;
  end loop;

  select coalesce(count(*), 0) + 1 into next_sort
  from public.portfell_portfolio_owners
  where user_id = uid;

  insert into public.portfell_portfolios (name, slug, sort_order, cash_balance, owner_id)
  values (trim(p_name), new_slug, next_sort, 0, uid)
  returning * into new_row;

  insert into public.portfell_portfolio_owners (portfolio_id, user_id)
  values (new_row.id, uid)
  on conflict (portfolio_id, user_id) do nothing;

  return jsonb_build_object(
    'id', new_row.id,
    'name', new_row.name,
    'slug', new_row.slug,
    'sort_order', new_row.sort_order,
    'cash_balance', new_row.cash_balance,
    'created_at', new_row.created_at,
    'updated_at', new_row.updated_at,
    'owner_id', new_row.owner_id
  );
end;
$$;

revoke all on function public.portfell_create_portfolio_for_me(text) from public;
grant execute on function public.portfell_create_portfolio_for_me(text) to authenticated;
