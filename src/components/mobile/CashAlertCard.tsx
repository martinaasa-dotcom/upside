"use client";

import { cn, currency } from "@/lib/format";
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
  className,
}: {
  cash: number;
  alerts: UpsideAlert[];
  onOpenCash?: () => void;
  onOpenAlerts?: () => void;
  className?: string;
}) {
  const cashAlert = alerts.find(isCashish);
  const featured = cashAlert ?? alerts[0];
  if (!featured && cash >= 0) return null;

  const openCash = Boolean(cashAlert) || cash < 0;
  const body =
    featured?.title ??
    (cash < 0 ? `Cash is ${currency(cash, 0)}.` : null);
  if (!body) return null;

  return (
    <button
      type="button"
      onClick={() => (openCash ? onOpenCash?.() : onOpenAlerts?.())}
      className={cn(
        "w-full rounded-2xl bg-gradient-to-r from-[#C4A265] via-[#D6AD69] to-[#8C6A2C] p-5 text-left text-white",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">
          {openCash ? "Cash" : "Alert"}
        </p>
        <ChevronRight className="h-4 w-4 opacity-80" aria-hidden />
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/20">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <p className="text-sm tabular-nums text-white/90">{body}</p>
      </div>
    </button>
  );
}
