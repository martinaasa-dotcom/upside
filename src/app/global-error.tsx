"use client";

import { useEffect } from "react";
import { Inter, Montserrat } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });
const montserrat = Montserrat({ subsets: ["latin"], display: "swap" });

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
        className={inter.className}
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
          background: "#08090c",
          color: "#f4f1ea",
        }}
      >
        <div>
          <h1
            className={montserrat.className}
            style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}
          >
            Upside Lab hit a snag
          </h1>
          <p
            style={{
              marginTop: "0.5rem",
              maxWidth: "22rem",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#9aa3ad",
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
              background: "#dcad55",
              color: "#0c0c0c",
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
              border: "1px solid #d6ad69",
              background: "transparent",
              color: "#eed7b5",
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
