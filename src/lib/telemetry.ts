import { isRecord } from "@/lib/unknown";

export const SLOW_ROUTE_MS = 1000;

export type TelemetryLevel = "info" | "warn" | "error";

export type TelemetryFields = Record<string, unknown>;

const MAX_CONTEXT_KEYS = 24;
const MAX_STRING = 500;
const MAX_STACK = 4000;

function isPerfEvent(event: string): boolean {
  return event === "slow_route" || event === "web_vital";
}

/** Errors always print. Slow routes and vitals stay quiet outside production. */
function shouldEmit(event: string, level: TelemetryLevel): boolean {
  if (level === "error") return true;
  if (isPerfEvent(event)) return process.env.NODE_ENV === "production";
  return true;
}

function scalar(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, MAX_STRING);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (value == null) return null;
  return undefined;
}

/** Flatten unknown JSON into a small, log-safe object. Drops nested junk. */
export function sanitizeContext(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Object.keys(out).length >= MAX_CONTEXT_KEYS) break;
    if (key.length > 64) continue;
    const flat = scalar(raw);
    if (flat !== undefined) {
      out[key] = flat;
      continue;
    }
    if (Array.isArray(raw)) {
      out[key] = raw.slice(0, 12).map((item) => {
        const s = scalar(item);
        return s === undefined ? "[unlogged]" : s;
      });
      continue;
    }
    if (isRecord(raw)) {
      const nested: Record<string, unknown> = {};
      for (const [nk, nv] of Object.entries(raw)) {
        if (Object.keys(nested).length >= 12) break;
        const s = scalar(nv);
        if (s !== undefined) nested[nk] = s;
      }
      out[key] = nested;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function payload(entry: {
  level: TelemetryLevel;
  event: string;
  fields: TelemetryFields;
}): Record<string, unknown> {
  const context = sanitizeContext(entry.fields) ?? {};
  const stack =
    typeof context.stack === "string" ? context.stack.slice(0, MAX_STACK) : undefined;
  if (stack) context.stack = stack;
  return {
    ts: new Date().toISOString(),
    level: entry.level,
    event: entry.event,
    ...context,
  };
}

/**
 * One-line JSON for Vercel logs. Never throws.
 *
 * `slow_route` / `web_vital` only emit in production so local `next dev`
 * does not drown in timing noise. Errors always emit.
 */
export function logEvent(
  event: string,
  fields: TelemetryFields = {},
  level: TelemetryLevel = "info"
): void {
  try {
    if (!shouldEmit(event, level)) return;
    const line = JSON.stringify(payload({ level, event, fields }));
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.info(line);
  } catch {
    /* a broken logger must not take down the request it is describing */
  }
}

export function routeMeta(req: unknown): {
  method?: string;
  path?: string;
} {
  if (!(req instanceof Request)) return {};
  try {
    return {
      method: req.method,
      path: new URL(req.url).pathname,
    };
  } catch {
    return { method: req.method };
  }
}
