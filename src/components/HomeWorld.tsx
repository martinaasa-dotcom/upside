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
export function HomeWorld({ className }: { className?: string }) {
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
  }, []);

  const primary = communities?.[0];
  const communityHref = primary ? `/communities/${primary.id}` : "/communities";
  const communityTitle = primary
    ? communities && communities.length > 1
      ? `${primary.name} and ${communities.length - 1} more`
      : primary.name
    : "Start a circle";
  const communityDetail = primary
    ? "Live books, read-only. See who is winning today."
    : "Invite people you trust, or ask to join a public circle.";

  return (
    <Panel className={cn("overview-fade", className)}>
      <PanelHeader
        title="Around Upside"
        subtitle="The paper Fund Margus runs in public, and the circles you compare books with. Separate from your own sheets."
        icon={<Users className="h-4 w-4" />}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                <p className="mt-2 text-xl font-semibold tabular-nums text-white">
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
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-400">
                  {fund.headline ??
                    "Paper money. One decision a day. Watch it, don't copy it."}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-base font-semibold text-white">
                  Watch Margus trade
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-400">
                  A paper-money book run in public. One decision a day, every
                  trade with a thesis.
                </p>
              </>
            )}
            <p className="mt-3 text-xs font-medium text-brand-bright">
              Open the Fund
            </p>
          </Card>
        </Link>

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
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              {communities === null
                ? "Compare books with people you actually know."
                : communityDetail}
            </p>
            <p className="mt-3 text-xs font-medium text-brand-bright">
              {primary ? "Open your circle" : "Browse communities"}
            </p>
          </Card>
        </Link>
      </div>
    </Panel>
  );
}
