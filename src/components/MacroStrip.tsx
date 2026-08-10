"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    let alive = true;
    void fetchMacro().then((m) => {
      if (alive) setMacro(m);
    });
    const id = window.setInterval(() => {
      void fetchMacro().then((m) => {
        if (alive) setMacro(m);
      });
    }, 120_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const items = [
    { label: "VIX", value: fmt(macro.vix, 2) },
    { label: "EURUSD", value: fmt(macro.eurusd, 4) },
    { label: "BTC", value: fmt(macro.btc, 0) },
    { label: "10Y", value: macro.tenYear != null ? `${fmt(macro.tenYear, 2)}%` : "—" },
  ];

  return (
    <div className="hidden items-center gap-3 text-[11px] tabular-nums text-zinc-500 sm:flex">
      {items.map((i) => (
        <span key={i.label}>
          <span className="text-zinc-600">{i.label}</span>{" "}
          <span className="text-zinc-300">{i.value}</span>
        </span>
      ))}
    </div>
  );
}
