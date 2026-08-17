"use client";

import { UpsideLogo } from "@/components/UpsideLogo";
import { reportClientError } from "@/lib/telemetry-client";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      widget: "error-boundary",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[radial-gradient(ellipse_at_top,_#161b25_0%,_#08090c_52%)] px-4 text-center">
      <UpsideLogo variant="icon" />
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-semibold text-foreground">
          Something broke on this screen
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Your holdings are safe. This screen hit a snag. Try again, or
          reload if it keeps happening.
        </p>
        {error.digest && (
          <p className="text-sm text-muted">Ref: {error.digest}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex items-center gap-1.5 btn-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:border-brand hover:text-foreground"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
