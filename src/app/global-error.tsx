"use client";

import { useEffect } from "react";

// global-error replaces the root layout when the layout itself throws, so
// it can't rely on globals.css/Tailwind or the app's providers — it must
// bring its own <html>/<body> and inline styles.
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled Upside Lab layout error", error);
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
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "1.5rem",
          textAlign: "center",
          background: "#08090C",
          color: "#f5f2eb",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, sans-serif",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.1rem", fontWeight: 600, margin: 0 }}>
            Upside Lab hit a snag
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              maxWidth: "22rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#a1a1aa",
            }}
          >
            Your book is safe. This was a rendering error in the app shell,
            so reload to get back in.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              borderRadius: "0.5rem",
              border: "none",
              background: "#ffffff",
              color: "#0a0a0a",
              fontWeight: 600,
              fontSize: "0.875rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              borderRadius: "0.5rem",
              border: "1px solid #3f3f46",
              background: "transparent",
              color: "#d4d4d8",
              fontSize: "0.875rem",
              padding: "0.5rem 1rem",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
