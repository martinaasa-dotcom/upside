"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Hydration-safe online flag. `navigator.onLine` is a browser-only read,
 * so the first render is always `true` (matches the server). The real
 * value swaps in before paint.
 *
 * This app has no Supabase Realtime sockets. Reconnect is the `online`
 * event plus the existing book/quote polls.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useLayoutEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
