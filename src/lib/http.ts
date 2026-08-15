import { plainError } from "@/lib/plain-error";

/**
 * Safe JSON reading for API responses.
 *
 * `await res.json()` throws a raw SyntaxError ("Unexpected token 'A', "An
 * error o"... is not valid JSON") whenever the body isn't JSON, which is
 * exactly what happens when the platform kills a long-running function and
 * serves its own plain-text error page instead of ours. The AI routes
 * (forecast, pulse, chat) are the realistic candidates for that, since a
 * slow provider chain can outlive the function's maxDuration.
 *
 * Callers get a human sentence in every one of those cases instead.
 */

function describeNonJsonFailure(
  status: number,
  body: string,
  fallback: string
): string {
  const hint = body.toLowerCase();
  if (status === 504 || hint.includes("timeout") || hint.includes("timed out")) {
    return "That took too long and the server cut it off before it finished. Try again.";
  }
  if (status === 429) return "Too many requests right now. Give it a few seconds.";
  if (status === 502 || status === 503) {
    return "The server is briefly unavailable. Try again in a moment.";
  }
  if (status >= 500) return "The server hit an unexpected error. Try again.";
  if (status === 401 || status === 403) {
    return "Your session expired. Refresh the page and sign in again.";
  }
  return fallback;
}

/**
 * Parse a JSON response, throwing an Error carrying a message worth showing
 * a user. Handles three cases: a JSON error payload (uses its `error`), a
 * non-JSON body (maps the status to plain English), and success.
 */
export async function readJsonOrThrow<T>(
  res: Response,
  fallback: string
): Promise<T> {
  const text = await res.text();

  let parsed: unknown = null;
  if (text.trim()) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (parsed !== null && typeof parsed === "object") {
    if (!res.ok) {
      const message = (parsed as { error?: unknown }).error;
      throw new Error(plainError(message, fallback));
    }
    return parsed as T;
  }

  throw new Error(describeNonJsonFailure(res.status, text, fallback));
}
