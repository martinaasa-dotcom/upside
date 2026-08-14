"use client";

import { currency } from "@/lib/format";
import type { UpsideAlert } from "@/lib/alerts";
import { AlertTriangle, ChevronRight } from "lucide-react";

function isCashish(alert: UpsideAlert): boolean {
  return /cash|margin|borrow/i.test(`${alert.title} ${alert.detail}`);
}

export function CashAlertCard({
  cash,
  alerts,
  onOpenCash,
  onOpenAlerts,
}: {
  cash: number;
  alerts: UpsideAlert[];
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
}) {
  const cashAlert = alerts.find(isCashish);
  const featured = cashAlert ?? alerts[0];
  const openCash = Boolean(cashAlert) || (cash < 0 && !featured);
  const body =
    featured?.detail ??
    (cash < 0
      ? `Cash is ${currency(cash, 0)}, so part of this book is on margin.`
      : `Cash is ${currency(cash, 0)}. Sitting ready when you want it.`);

  return (
    <button
      type="button"
      onClick={() => (openCash ? onOpenCash?.() : onOpenAlerts?.())}
      className="w-full rounded-2xl bg-gradient-to-r from-[#C4A265] via-[#D6AD69] to-[#8C6A2C] p-4 text-left text-white"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">Cash Alerts</p>
        <ChevronRight className="h-4 w-4 opacity-80" aria-hidden />
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-white/90">{body}</p>
      </div>
    </button>
  );
}
