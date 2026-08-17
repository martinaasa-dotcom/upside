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
        "w-full rounded-2xl border border-loss/30 bg-loss/10 p-5 text-left",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold text-foreground">
          {openCash ? "Cash" : "Alert"}
        </p>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </div>
      <div className="mt-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-loss/15 text-loss">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <p className="text-base tabular-nums text-foreground">{body}</p>
      </div>
    </button>
  );
}
