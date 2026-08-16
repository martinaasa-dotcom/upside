-- Discord-style invite history: who minted the link, who used it,
-- and a retire switch. Open / allowlist links stay reusable. One use
-- row per person per link so a second click does not inflate the count.

alter table public.portfell_community_invites
  add column if not exists token_hint text;

comment on column public.portfell_community_invites.token_hint is
  'Last 6 characters of the raw token. Enough to recognise a link in the admin list. Not enough to rebuild the URL.';

create table if not exists public.portfell_community_invite_uses (
  invite_id uuid not null references public.portfell_community_invites(id) on delete cascade,
  user_id uuid not null references public.portfell_profiles(id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (invite_id, user_id)
);

create index if not exists portfell_community_invite_uses_invite_idx
  on public.portfell_community_invite_uses (invite_id, used_at desc);

comment on table public.portfell_community_invite_uses is
  'One row per person who joined with a given community invite. Source of the uses count on the admin list.';

alter table public.portfell_community_invite_uses enable row level security;

revoke all on table public.portfell_community_invite_uses from anon, public, authenticated;
grant select, insert, update, delete on table public.portfell_community_invite_uses to service_role;

create or replace function public.portfell_redeem_community_invite(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  em text;
  inv public.portfell_community_invites;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_token_hash is null or length(trim(p_token_hash)) < 16 then
    return jsonb_build_object('ok', false, 'error', 'Invalid invite');
  end if;

  select lower(email) into em from auth.users where id = uid;

  select * into inv
  from public.portfell_community_invites
  where token_hash = p_token_hash
    and revoked_at is null
    and (expires_at is null or expires_at > now())
    and (
      email is null
      or (
        em is not null
        and em = any(string_to_array(email, ','))
      )
    );

  if inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'Invalid invite');
  end if;

  insert into public.portfell_community_members (community_id, user_id, role)
  values (inv.community_id, uid, coalesce(nullif(inv.role, ''), 'member'))
  on conflict (community_id, user_id) do update
    set role = case
      when portfell_community_members.role = 'admin' then 'admin'
      else excluded.role
    end;

  insert into public.portfell_community_invite_uses (invite_id, user_id)
  values (inv.id, uid)
  on conflict (invite_id, user_id) do nothing;

  return jsonb_build_object('ok', true, 'community_id', inv.community_id);
end;
$$;

revoke all on function public.portfell_redeem_community_invite(text) from public, anon;
grant execute on function public.portfell_redeem_community_invite(text) to authenticated;
