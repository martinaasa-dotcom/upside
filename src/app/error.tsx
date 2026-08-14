"use client";

import { UpsideLogo } from "@/components/UpsideLogo";
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
    console.error("Unhandled Upside Lab render error", error);
    void fetch("/api/internal/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        digest: error.digest,
        path: window.location.pathname,
      }),
    }).catch(() => {
      /* reporting is best-effort */
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[radial-gradient(ellipse_at_top,_#100e0a_0%,_#08090C_52%)] px-4 text-center">
      <UpsideLogo variant="icon" />
      <div className="max-w-sm space-y-2">
        <h1 className="text-lg font-semibold text-white">
          Something broke on this screen
        </h1>
        <p className="text-sm leading-relaxed text-zinc-400">
          Your book is safe. This was just a rendering hiccup, so try again,
          or reload if it keeps happening.
        </p>
        {error.digest && (
          <p className="text-xs text-zinc-400">Ref: {error.digest}</p>
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
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
