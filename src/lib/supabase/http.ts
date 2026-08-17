/**
 * Every server Supabase call is HTTP to PostgREST, not a held Postgres
 * session. A hung fetch would pin the Fluid Compute isolate and keep the
 * pooler slot busy until statement_timeout (120s). Abort so a spike cannot
 * leak connections.
 */
export const SUPABASE_FETCH_TIMEOUT_MS = 12_000;

export function supabaseFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const timeout = AbortSignal.timeout(SUPABASE_FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  return fetch(input, { ...init, signal });
}
