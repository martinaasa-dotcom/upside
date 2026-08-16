"use client";

import { TICKER_QUERY_MAX } from "@/lib/input-guard";
import type { TickerSuggestion } from "@/lib/market/ticker-search";
import { useEffect, useRef, useState } from "react";

/** Yahoo name + ticker hits for a search box. Debounced. */
export function useTickerSearch(query: string): TickerSuggestion[] {
  const [remote, setRemote] = useState<TickerSuggestion[]>([]);
  const gen = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || q.length > TICKER_QUERY_MAX) {
      setRemote([]);
      return;
    }
    const id = ++gen.current;
    const timer = window.setTimeout(() => {
      void fetch(`/api/market/search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { results?: TickerSuggestion[] } | null) => {
          if (gen.current !== id) return;
          setRemote(Array.isArray(data?.results) ? data.results : []);
        })
        .catch(() => {
          if (gen.current === id) setRemote([]);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  return remote;
}
