import { isAbortError, isNetworkError } from "@/lib/abort";
import {
  enqueueSync,
  isQueueableRequest,
  type SyncKind,
  type SyncMethod,
} from "@/lib/offline/sync-queue";

function methodOf(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

function parseJsonBody(init?: RequestInit): unknown {
  const raw = init?.body;
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function queuedResponse(): Response {
  return Response.json({ ok: true, queued: true }, { status: 202 });
}

/**
 * Mutating calls that are safe to replay (prefs, drafts) land in IndexedDB
 * when the device is offline, then flush on reconnect. Holdings writes still
 * fail through so the book stays read-only until the network is back.
 */
export async function fetchOrQueue(
  input: string,
  init?: RequestInit,
  opts?: { kind?: SyncKind }
): Promise<Response> {
  const method = methodOf(init);
  const kind: SyncKind = opts?.kind ?? "preference";
  const queueable = isQueueableRequest(input, method);
  const offline =
    typeof navigator !== "undefined" && navigator.onLine === false;

  if (queueable && offline) {
    await enqueueSync({
      kind,
      url: input,
      method: method as SyncMethod,
      body: parseJsonBody(init),
    });
    return queuedResponse();
  }

  try {
    return await fetch(input, init);
  } catch (err) {
    if (queueable && !isAbortError(err) && isNetworkError(err)) {
      await enqueueSync({
        kind,
        url: input,
        method: method as SyncMethod,
        body: parseJsonBody(init),
      });
      return queuedResponse();
    }
    throw err;
  }
}

export function postJsonOrQueue(
  url: string,
  body: unknown,
  kind: SyncKind = "preference",
  method: SyncMethod = "POST"
): Promise<Response> {
  return fetchOrQueue(
    url,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    { kind }
  );
}
