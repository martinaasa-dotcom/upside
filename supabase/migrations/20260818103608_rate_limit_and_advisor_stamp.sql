-- Shared LLM quota across Vercel instances, plus a stamp when someone
-- actually used Margus, Pulse, or Forecast. Additive only.

alter table public.portfell_profiles
  add column if not exists last_advisor_at timestamptz;

create table if not exists public.portfell_rate_buckets (
  bucket_key text primary key,
  hit_count integer not null default 0,
  reset_at timestamptz not null
);

alter table public.portfell_rate_buckets enable row level security;

revoke all on table public.portfell_rate_buckets from public;
revoke all on table public.portfell_rate_buckets from anon;
revoke all on table public.portfell_rate_buckets from authenticated;

create or replace function public.portfell_rate_take(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := clock_timestamp();
  window_iv interval;
  rec public.portfell_rate_buckets%rowtype;
  retry_sec integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    return jsonb_build_object('ok', false, 'retryAfterSec', 60);
  end if;
  if p_limit is null or p_limit < 1 or p_window_ms is null or p_window_ms < 1000 then
    return jsonb_build_object('ok', false, 'retryAfterSec', 60);
  end if;

  window_iv := make_interval(secs => ceil(p_window_ms / 1000.0)::integer);

  insert into public.portfell_rate_buckets (bucket_key, hit_count, reset_at)
  values (p_key, 1, now_ts + window_iv)
  on conflict (bucket_key) do update
    set hit_count = case
      when portfell_rate_buckets.reset_at <= now_ts then 1
      when portfell_rate_buckets.hit_count >= p_limit then p_limit + 1
      else portfell_rate_buckets.hit_count + 1
    end,
        reset_at = case
      when portfell_rate_buckets.reset_at <= now_ts then now_ts + window_iv
      else portfell_rate_buckets.reset_at
    end
  returning * into rec;

  if rec.hit_count > p_limit then
    retry_sec := greatest(
      1,
      ceil(extract(epoch from (rec.reset_at - now_ts)))::integer
    );
    return jsonb_build_object('ok', false, 'retryAfterSec', retry_sec);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.portfell_rate_take(text, integer, integer) from public;
revoke all on function public.portfell_rate_take(text, integer, integer) from anon;
revoke all on function public.portfell_rate_take(text, integer, integer) from authenticated;
grant execute on function public.portfell_rate_take(text, integer, integer) to service_role;
