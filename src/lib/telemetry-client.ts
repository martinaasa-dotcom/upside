import { ACTIVE_SHEET_KEY } from "@/lib/active-sheet";
import { loadLastUser } from "@/lib/last-session";
import { supabaseIsConfigured } from "@/lib/supabase/env";
import { workspaceRoomId } from "@/lib/workspace-paths";

export type ClientErrorReport = {
  message: string;
  stack?: string | null;
  digest?: string | null;
  widget?: string;
  componentStack?: string | null;
};

export type ClientSessionSnapshot = {
  signedIn: boolean;
  userId: string | null;
  demoLocked: boolean;
  supabaseConfigured: boolean;
  sheetId: string | null;
  room: string | null;
  path: string;
  online: boolean;
  visibility: string | null;
};

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * What was true in this tab when the crash happened. Reads caches already
 * on the device so a widget throw does not wait on auth.
 *
 * `portfell-locked` must stay in lockstep with LOCKED_STORAGE_KEY in
 * demo-store. This file does not import demo-store so a crash reporter
 * cannot pull the demo book into every page chunk.
 */
export function readClientSessionSnapshot(): ClientSessionSnapshot {
  const last = loadLastUser();
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  return {
    signedIn: Boolean(last?.id),
    userId: last?.id ?? null,
    demoLocked: Boolean(readStorage("portfell-locked")),
    supabaseConfigured: supabaseIsConfigured(),
    sheetId: readStorage(ACTIVE_SHEET_KEY),
    room: workspaceRoomId(path),
    path,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    visibility:
      typeof document !== "undefined" ? document.visibilityState : null,
  };
}

function postReport(body: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify(body);
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      if (navigator.sendBeacon("/api/internal/log-error", blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }
  void fetch("/api/internal/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => {
    /* reporting is best-effort */
  });
}

/** Widget / render crashes. Structured console + the existing error log. */
export function reportClientError(report: ClientErrorReport): void {
  const session = readClientSessionSnapshot();
  const context = {
    widget: report.widget ?? null,
    componentStack: report.componentStack?.slice(0, 2000) ?? null,
    ...session,
  };
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event: "client_error",
      message: report.message,
      widget: report.widget ?? null,
      path: session.path,
      signedIn: session.signedIn,
      userId: session.userId,
      demoLocked: session.demoLocked,
    })
  );
  postReport({
    message: report.message,
    stack: report.stack ?? null,
    digest: report.digest ?? null,
    path: session.path,
    context,
  });
}

export type WebVitalReport = {
  name: string;
  value: number;
  rating?: string;
  id?: string;
  navigationType?: string;
  delta?: number;
};

/** Production-only. sendBeacon so it cannot block paint or unload. */
export function reportWebVital(metric: WebVitalReport): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") return;
  const path = window.location.pathname;
  const body = JSON.stringify({
    event: "web_vital",
    name: metric.name,
    value: Math.round(metric.value * 100) / 100,
    rating: metric.rating ?? null,
    id: metric.id ?? null,
    navigationType: metric.navigationType ?? null,
    delta:
      typeof metric.delta === "number" && Number.isFinite(metric.delta)
        ? Math.round(metric.delta * 100) / 100
        : null,
    path,
  });
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/internal/telemetry", blob)) return;
    }
  } catch {
    /* fall through */
  }
  void fetch("/api/internal/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* vitals are best-effort */
  });
}
