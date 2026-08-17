import { logEvent, SLOW_ROUTE_MS } from "@/lib/telemetry";

type MarkedServer = {
  __upsideSlowRoute?: boolean;
  emit: (event: string | symbol, ...args: unknown[]) => boolean;
};

/**
 * Catch-all timer for `/api/*` when the runtime is a Node HTTP server.
 * Vercel may invoke route handlers without `http.Server`; those paths are
 * covered by `observeRoute`. This hook is best-effort and idempotent.
 */
export async function installSlowRouteLogger(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "edge") return;
  try {
    const http = await import("node:http");
    const proto = http.Server.prototype as unknown as MarkedServer;
    if (proto.__upsideSlowRoute) return;
    proto.__upsideSlowRoute = true;
    const origEmit = proto.emit;
    proto.emit = function (this: unknown, event: string | symbol, ...args: unknown[]) {
      if (event === "request") {
        const req = args[0] as import("node:http").IncomingMessage | undefined;
        const res = args[1] as import("node:http").ServerResponse | undefined;
        const url = req?.url ?? "";
        if (req && res && url.startsWith("/api/")) {
          const started = performance.now();
          res.on("finish", () => {
            const ms = Math.round(performance.now() - started);
            if (ms > SLOW_ROUTE_MS) {
              logEvent(
                "slow_route",
                {
                  method: req.method ?? null,
                  path: url.split("?")[0],
                  ms,
                  status: res.statusCode,
                },
                "warn"
              );
            }
          });
        }
      }
      return origEmit.call(this, event, ...args);
    };
  } catch {
    /* adapter without http.Server */
  }
}
