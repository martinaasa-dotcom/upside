"use client";

import { useEffect, useState } from "react";
import type { FearGreedSnapshot } from "@/lib/market/fear-greed";
import { fearGreedTone } from "@/lib/market/fear-greed";
import { cn } from "@/lib/format";

type Macro = {
  vix: number | null;
  eurusd: number | null;
  btc: number | null;
  tenYear: number | null;
};

async function fetchMacro(): Promise<Macro> {
  try {
    const res = await fetch(
      "/api/quotes?tickers=%5EVIX,EURUSD%3DX,BTC-USD,%5ETNX"
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
  } catch {
    return { vix: null, eurusd: null, btc: null, tenYear: null };
  }
}

async function fetchFearGreed(): Promise<FearGreedSnapshot | null> {
  try {
    const res = await fetch("/api/market/fear-greed");
    if (!res.ok) return null;
    return (await res.json()) as FearGreedSnapshot;
  } catch {
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
  const [macro, setMacro] = useState<Macro>({
    vix: null,
    eurusd: null,
    btc: null,
    tenYear: null,
  });
  const [fearGreed, setFearGreed] = useState<FearGreedSnapshot | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMacro().then((m) => {
      if (alive) setMacro(m);
    });
    void fetchFearGreed().then((fg) => {
      if (alive) setFearGreed(fg);
    });
    const id = window.setInterval(() => {
      void fetchMacro().then((m) => {
        if (alive) setMacro(m);
      });
      void fetchFearGreed().then((fg) => {
        if (alive) setFearGreed(fg);
      });
    }, 120_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

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
    <div className="flex w-full max-w-none items-center gap-1.5 overflow-x-auto text-[10px] tabular-nums text-zinc-500 sm:max-w-none sm:gap-3 sm:text-[11px]">
      {items.map((i) => (
        <span key={i.label} title={i.title}>
          <span className="text-zinc-600">{i.label}</span>{" "}
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
  );
}
