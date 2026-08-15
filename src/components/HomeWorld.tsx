"use client";

import { Card, MicroLabel, Panel, PanelHeader } from "@/components/ui/Panel";
import { cn, currency, signedCurrency, signedTone } from "@/lib/format";
import {
  fundDayNumber,
  liveFundTodayMove,
  liveFundTotalValue,
} from "@/lib/margus-fund-mark";
import { loadUpsidePortfolioCache } from "@/lib/upside-portfolio-cache";
import { ArrowRight, Bot, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type FundTeaser = {
  totalValue: number;
  todayDollar: number;
  todayPct: number | null;
  headline: string | null;
  dayNumber: number;
  openCount: number;
};

type CommunityRow = {
  id: string;
  name: string;
  role: string;
};

function teaserFromFundCache(): FundTeaser | null {
  const cached = loadUpsidePortfolioCache()?.payload as
    | {
        fund?: { cash?: number; inception_date?: string; starting_capital?: number };
        holdings?: Array<{
          ticker: string;
          shares: number;
          cost_basis: number;
          status?: string;
        }>;
        reports?: Array<{
          headline?: string;
          portfolio_value?: number;
          cash?: number;
        }>;
        quotes?: Record<string, { price?: number }>;
      }
    | undefined;
  if (!cached?.fund) return null;
  const open = (cached.holdings ?? []).filter(
    (h) => !h.status || h.status === "open"
  );
  const latest = cached.reports?.[0];
  const cash = latest?.cash ?? cached.fund.cash ?? 0;
  const totalValue = liveFundTotalValue({
    cash,
    holdings: open,
    quotes: cached.quotes ?? {},
  });
  const { todayDollar, todayPct } = liveFundTodayMove({
    liveTotal: totalValue,
    lastReportValue: latest?.portfolio_value,
  });
  return {
    totalValue,
    todayDollar,
    todayPct,
    headline: latest?.headline?.trim() || null,
    dayNumber: fundDayNumber(cached.fund.inception_date),
    openCount: open.length,
  };
}

/**
 * Fund + Communities on Overview. Not a second hero, not a one-line
 * afterthought. These are rooms people come back for.
 */
export function HomeWorld({
  className,
  fundOnly = false,
}: {
  className?: string;
  /** On Circle, the communities card just links back here. Fund only. */
  fundOnly?: boolean;
}) {
  const [fund, setFund] = useState<FundTeaser | null>(() => teaserFromFundCache());
  const [communities, setCommunities] = useState<CommunityRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/upside-portfolio/teaser");
        if (!res.ok) return;
        const data = (await res.json()) as FundTeaser;
        if (!cancelled && Number.isFinite(data.totalValue)) setFund(data);
      } catch {
        /* keep cache / empty card */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fundOnly) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/communities");
        if (!res.ok) {
          if (!cancelled) setCommunities([]);
          return;
        }
        const data = await res.json();
        if (!cancelled) setCommunities(data.communities ?? []);
      } catch {
        if (!cancelled) setCommunities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fundOnly]);

  const primary = communities?.[0];
  const communityHref = primary ? `/communities/${primary.id}` : "/communities";
  const communityTitle = primary
    ? communities && communities.length > 1
      ? `${primary.name} and ${communities.length - 1} more`
      : primary.name
    : "Start a circle";
  const communityDetail = primary
    ? "Live books, read-only."
    : "Invite people you trust.";

  return (
    <Panel className={cn("overview-fade", className)}>
      <PanelHeader
        title={fundOnly ? "Upside Fund" : "Around Upside Lab"}
        icon={<Users className="h-4 w-4" />}
      />
      <div
        className={cn(
          "mt-6 grid gap-4",
          fundOnly ? "grid-cols-1" : "sm:grid-cols-2"
        )}
      >
        <Link href="/upside-portfolio" className="group block">
          <Card
            tone="brand"
            interactive
            className="h-full px-4 py-4 transition group-hover:border-brand/50"
          >
            <div className="flex items-start justify-between gap-3">
              <MicroLabel>
                <Bot className="h-3.5 w-3.5 text-brand-bright" aria-hidden />
                Upside Fund
              </MicroLabel>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-brand-bright" />
            </div>
            {fund ? (
              <>
                <p className="mt-2 text-2xl font-bold tabular-nums text-white">
                  {currency(fund.totalValue, 0)}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm tabular-nums",
                    signedTone(fund.todayDollar, "text-zinc-400")
                  )}
                >
                  {signedCurrency(fund.todayDollar)} today
                  {fund.openCount > 0
                    ? ` · ${fund.openCount} open`
                    : ""}
                  {` · day ${fund.dayNumber}`}
                </p>
                <p className="mt-3 line-clamp-2 text-sm text-muted">
                  {fund.headline ??
                    "Paper money. One decision a day."}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-base font-semibold text-white">
                  Watch Margus trade
                </p>
                <p className="mt-3 text-sm text-muted">
                  A paper book run in public.
                </p>
              </>
            )}
          </Card>
        </Link>

        {!fundOnly && (
        <Link href={communityHref} className="group block">
          <Card
            interactive
            className="h-full px-4 py-4 transition group-hover:border-brand/50"
          >
            <div className="flex items-start justify-between gap-3">
              <MicroLabel>
                <Users className="h-3.5 w-3.5 text-brand-bright" aria-hidden />
                Communities
              </MicroLabel>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-brand-bright" />
            </div>
            <p className="mt-2 text-base font-semibold text-white">
              {communities === null ? "Your circles" : communityTitle}
            </p>
            <p className="mt-3 text-sm text-muted">
              {communities === null
                ? "Compare books with people you actually know."
                : communityDetail}
            </p>
          </Card>
        </Link>
        )}
      </div>
    </Panel>
  );
}
