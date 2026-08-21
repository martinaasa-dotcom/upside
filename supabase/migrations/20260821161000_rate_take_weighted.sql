-- A rate limit that can charge more than one unit per call.
--
-- `portfell_rate_take` counts calls. That is the right shape for the LLM
-- endpoints it was built for, where one request costs one unit of a shared
-- quota. It is the wrong shape for the market endpoints, and Pass 4 measured
-- why: the cost of a quote request is per *ticker*, not per request. One
-- unresolvable symbol costs ~52 upstream Yahoo calls, because the resolver
-- walks the bare symbol plus 16 European suffixes and only a hit stops it
-- early. A limiter that counts requests cannot see that at all -- 120
-- requests a minute is either trivial or tens of thousands of upstream
-- calls, depending entirely on what is inside them.
--
-- So: same bucket table, same semantics, one extra argument. `p_cost` is
-- what this call consumes.
--
-- Deliberately a new name rather than a default argument on the existing
-- function. Adding `portfell_rate_take(text, integer, integer, integer)`
-- alongside `portfell_rate_take(text, integer, integer)` leaves PostgREST
-- resolving an overload by argument names, which is exactly the kind of
-- ambiguity that breaks at runtime rather than at deploy. The existing
-- three-argument function is untouched and every current caller keeps
-- working.
--
-- `p_cost = 0` is allowed and means "peek": report whether this bucket is
-- already over its limit without consuming anything. That is what lets a
-- cheap request be checked without being charged.

create or replace function public.portfell_rate_take_weighted(
  p_key text,
  p_limit integer,
  p_window_ms integer,
  p_cost integer
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
  cost integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 200 then
    return jsonb_build_object('ok', false, 'retryAfterSec', 60);
  end if;
  if p_limit is null or p_limit < 1 or p_window_ms is null or p_window_ms < 1000 then
    return jsonb_build_object('ok', false, 'retryAfterSec', 60);
  end if;

  -- A negative cost would refund, which would turn this into a way to
  -- clear your own bucket. Clamp instead of trusting the caller.
  cost := greatest(0, coalesce(p_cost, 1));

  window_iv := make_interval(secs => ceil(p_window_ms / 1000.0)::integer);

  if cost = 0 then
    -- Peek: read the live bucket without creating or consuming one.
    select * into rec
    from public.portfell_rate_buckets
    where bucket_key = p_key;

    if not found or rec.reset_at <= now_ts or rec.hit_count <= p_limit then
      return jsonb_build_object('ok', true);
    end if;

    retry_sec := greatest(
      1,
      ceil(extract(epoch from (rec.reset_at - now_ts)))::integer
    );
    return jsonb_build_object('ok', false, 'retryAfterSec', retry_sec);
  end if;

  insert into public.portfell_rate_buckets (bucket_key, hit_count, reset_at)
  values (p_key, cost, now_ts + window_iv)
  on conflict (bucket_key) do update
    set hit_count = case
      when portfell_rate_buckets.reset_at <= now_ts then cost
      when portfell_rate_buckets.hit_count >= p_limit then p_limit + 1
      else portfell_rate_buckets.hit_count + cost
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

revoke all on function public.portfell_rate_take_weighted(text, integer, integer, integer) from public;
revoke all on function public.portfell_rate_take_weighted(text, integer, integer, integer) from anon;
revoke all on function public.portfell_rate_take_weighted(text, integer, integer, integer) from authenticated;
grant execute on function public.portfell_rate_take_weighted(text, integer, integer, integer) to service_role;
