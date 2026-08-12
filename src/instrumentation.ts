import type { Instrumentation } from "next";
import { logError } from "@/lib/error-log";

/**
 * Next.js calls onRequestError automatically for any uncaught server-side
 * error (route handlers, server components, server actions) — this is the
 * one hook that covers all of them, instead of wrapping every individual
 * API route's try/catch by hand. See node_modules/next/dist/docs/01-app/
 * 03-api-reference/03-file-conventions/instrumentation.md.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  await logError({
    source: "server",
    message,
    stack,
    digest,
    path: request.path,
    routeType: context.routeType,
    context: { method: request.method, renderSource: context.renderSource },
  });
};
