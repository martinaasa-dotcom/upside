/** True for fetch/AbortController cancellation, which is not a real failure. */
export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

/** Fetch never reached the server (offline, DNS, connection dropped). */
export function isNetworkError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (typeof TypeError !== "undefined" && err instanceof TypeError) return true;
  return (
    err instanceof Error &&
    /failed to fetch|networkerror|load failed|network request failed/i.test(
      err.message
    )
  );
}

/**
 * Retry a network call with exponential backoff (1s, 2s, 4s).
 * Used on reconnect after sleep/offline, not on every ordinary load.
 */
export async function retryOnNetwork<T>(
  fn: () => Promise<T>,
  opts?: { attempts?: number; signal?: AbortSignal }
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    if (opts?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (isAbortError(e) || i === attempts - 1) throw e;
      const ms = 1000 * 2 ** i;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          window.clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const t = window.setTimeout(() => {
          opts?.signal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        opts?.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
  throw last;
}
