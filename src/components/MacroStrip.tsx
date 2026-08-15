"use client";

import { useEffect, useState } from "react";
import { isAbortError } from "@/lib/abort";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import { cn } from "@/lib/format";
import { quotePollMs } from "@/lib/market/session";

type Macro = {
  vix: number | null;
  eurusd: number | null;
  btc: number | null;
  tenYear: number | null;
};

async function fetchMacro(signal?: AbortSignal): Promise<Macro> {
  try {
    const res = await fetch(
      "/api/quotes?tickers=%5EVIX,EURUSD%3DX,BTC-USD,%5ETNX",
      { signal }
    );
    if (!res.ok) throw new Error("macro failed");
    const data = await res.json();
    const q = data.quotes ?? {};
    return {
      vix: q["^VIX"]?.price ?? null,
      eurusd: q["EURUSD=X"]?.price ?? null,
      btc: q["BTC-USD"]?.price ?? null,
      tenYear: q["^TNX"]?.price ?? null,
    };
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { vix: null, eurusd: null, btc: null, tenYear: null };
  }
}

async function fetchFearGreed(signal?: AbortSignal): Promise<FearGreedSnapshot | null> {
  try {
    const res = await fetch("/api/market/fear-greed", { signal });
    if (!res.ok) return null;
    return (await res.json()) as FearGreedSnapshot;
  } catch (err) {
    if (isAbortError(err)) throw err;
    return null;
  }
}

function fmt(n: number | null, digits = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function MacroStrip() {
  const [open, setOpen] = useState(true);
  const [macro, setMacro] = useState<Macro>({
    vix: null,
    eurusd: null,
    btc: null,
    tenYear: null,
  });
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    void fetchMacro(ctrl.signal).then((m) => {
      if (!ctrl.signal.aborted) setMacro(m);
    }).catch((err) => {
      if (isAbortError(err)) return;
    });
    void fetchFearGreed(ctrl.signal).then((fg) => {
      if (!ctrl.signal.aborted && fg) setFearGreed(fg);
    }).catch((err) => {
      if (isAbortError(err)) return;
    });
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          if (!document.hidden && !ctrl.signal.aborted) {
            void fetchMacro(ctrl.signal).then((m) => {
              if (!ctrl.signal.aborted) setMacro(m);
            }).catch((err) => {
              if (isAbortError(err)) return;
            });
            void fetchFearGreed(ctrl.signal).then((fg) => {
              if (!ctrl.signal.aborted && fg) setFearGreed(fg);
            }).catch((err) => {
              if (isAbortError(err)) return;
            });
          }
          if (!ctrl.signal.aborted) schedule();
        },
        quotePollMs()
      );
    };
    schedule();

    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [open]);

  const items = [
    fearGreed
      ? {
          label: "F&G",
          value: String(fearGreed.score),
          title: `CNN Fear & Greed: ${fearGreed.rating}`,
          tone: fearGreedTone(fearGreed.score),
        }
      : null,
    { label: "VIX", value: fmt(macro.vix, 2), title: "VIX", tone: null },
    { label: "EURUSD", value: fmt(macro.eurusd, 4), title: "EURUSD", tone: null },
    { label: "BTC", value: fmt(macro.btc, 0), title: "Bitcoin", tone: null },
    {
      label: "10Y",
      value: macro.tenYear != null ? `${fmt(macro.tenYear, 2)}%` : "—",
      title: "US 10-year yield",
      tone: null,
    },
  ].filter(Boolean) as Array<{
    label: string;
    value: string;
    title: string;
    tone: "fear" | "neutral" | "greed" | null;
  }>;

  return (
    <div className="flex min-w-0 items-center justify-end gap-2 text-xs text-zinc-400">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="shrink-0 rounded-md px-2 py-1 font-medium text-zinc-400 hover:text-zinc-200"
        aria-expanded={open}
      >
        Markets
      </button>
      {open && (
        <div className="scrollbar-none flex min-w-0 items-center gap-2 overflow-x-auto tabular-nums sm:gap-3">
          {items.map((i) => (
            <span key={i.label} className="shrink-0" title={i.title}>
              <span className="text-zinc-400">{i.label}</span>{" "}
              <span
                className={cn(
                  "text-zinc-300",
                  i.tone === "fear" && "text-sky-300",
                  i.tone === "greed" && "text-amber-300"
                )}
              >
                {i.value}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
