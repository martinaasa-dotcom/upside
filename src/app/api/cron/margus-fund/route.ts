import { requireCronAuth } from "@/lib/cron-auth";
import { isSuperadminEmail } from "@/lib/auth/superadmin";
import { getAuthUser } from "@/lib/supabase/server-auth";
import { getSupabaseServer, supabaseUsesServiceRole } from "@/lib/supabase/server";
import { PORTFELL_TABLES } from "@/lib/supabase/tables";
import { fetchQuotesWithFallback } from "@/lib/market/quotes";
import { fetchFearGreedIndex } from "@/lib/market/fear-greed";
import { buildAdvisorProviderChain, withAdvisorFallback } from "@/lib/ai/model";
import { humanizeMargusText, humanizeMargusTree } from "@/lib/ai/humanize-copy";
import {
  buildFundSystemPrompt,
  buildFundUserPrompt,
  buildWeeklyRecapSystemPrompt,
  buildWeeklyRecapUserPrompt,
  fundDecisionSchema,
  weeklyRecapSchema,
  type FundAction,
  type FundHolding,
  type PricedHolding,
} from "@/lib/margus-fund";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logError } from "@/lib/error-log";
import { todayKeyInTz } from "@/lib/timezone";
import { generateObject } from "ai";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Best-effort weekly recap, appended after a normal Friday run. Checked
 * against UTC day-of-week (not todayKeyInTz's report_date), since the
 * 21:30 UTC run time rolls the Tallinn calendar date to Saturday before
 * the report_date is even computed -- getUTCDay() still correctly reads
 * as Friday because the run happens *within* Friday in UTC, which is the
 * timezone that actually matches the US trading day being wrapped up.
 * Never throws -- a recap failure shouldn't fail the whole cron run.
 */
async function maybeGenerateWeeklyRecap(
  supabase: SupabaseClient,
  weekEnding: string,
  fundStartingCapital: number,
  pricedHoldings: PricedHolding[]
): Promise<void> {
  if (new Date().getUTCDay() !== 5) return;

  try {
    const { data: existing } = await supabase
      .from(PORTFELL_TABLES.margusFundWeeklyRecaps)
      .select("id")
      .eq("week_ending", weekEnding)
      .maybeSingle();
    if (existing) return;

    const { data: recentReports } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("report_date, portfolio_value, spy_price, actions")
      .order("report_date", { ascending: false })
      .limit(7);
    const reports = (recentReports ?? []) as {
      report_date: string;
      portfolio_value: number;
      spy_price: number | null;
      actions: FundAction[];
    }[];
    if (reports.length === 0) return;

    const chronological = [...reports].reverse();
    const latest = chronological[chronological.length - 1]!;
    const oldest = chronological[0]!;

    const portfolioValueStart =
      chronological.length > 1 ? oldest.portfolio_value : fundStartingCapital;
    const portfolioValueEnd = latest.portfolio_value;
    const weekReturnPct =
      portfolioValueStart > 0
        ? (portfolioValueEnd - portfolioValueStart) / portfolioValueStart
        : 0;
    const spyWeekReturnPct =
      oldest.spy_price && latest.spy_price
        ? (latest.spy_price - oldest.spy_price) / oldest.spy_price
        : null;

    const weekActions = chronological.flatMap((r) =>
      (r.actions ?? [])
        .filter((a) => a.type !== "hold")
        .map((a) => ({
          date: r.report_date,
          type: a.type,
          ticker: a.ticker,
          reasoning: a.reasoning,
        }))
    );

    const chain = buildAdvisorProviderChain({ reasoning: true });
    if (chain.length === 0) return;

    const { object: rawRecap } = await withAdvisorFallback(chain, (model) =>
      generateObject({
        model,
        schema: weeklyRecapSchema,
        system: buildWeeklyRecapSystemPrompt(),
        prompt: buildWeeklyRecapUserPrompt({
          weekEnding,
          portfolioValueStart,
          portfolioValueEnd,
          weekReturnPct,
          spyWeekReturnPct,
          currentHoldings: pricedHoldings,
          weekActions,
        }),
      })
    );
    const recap = humanizeMargusTree(rawRecap);

    await supabase.from(PORTFELL_TABLES.margusFundWeeklyRecaps).insert({
      week_ending: weekEnding,
      headline: recap.headline,
      body: recap.body,
      week_return_pct: weekReturnPct,
      spy_week_return_pct: spyWeekReturnPct,
      portfolio_value_start: portfolioValueStart,
      portfolio_value_end: portfolioValueEnd,
    });
  } catch (err) {
    await logError({
      source: "server",
      message: `Upside Portfolio weekly recap failed: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/margus-fund",
    });
  }
}

/** Vercel Cron (Bearer CRON_SECRET) OR a signed-in superadmin manually
 * re-triggering/backfilling from /admin. Either is accepted; neither a
 * regular user nor a co-owner can trigger this. */
async function requireCronOrSuperadmin(req: Request) {
  const cronDenied = requireCronAuth(req);
  if (!cronDenied) return null;
  const user = await getAuthUser().catch(() => null);
  if (user && isSuperadminEmail(user.email)) return null;
  return cronDenied;
}

export async function GET(req: Request) {
  const denied = await requireCronOrSuperadmin(req);
  if (denied) return denied;

  if (!supabaseUsesServiceRole()) {
    return NextResponse.json(
      {
        error:
          "Upside Portfolio needs SUPABASE_SERVICE_ROLE_KEY -- this runs with no user session and writes a shared, global record.",
      },
      { status: 503 }
    );
  }

  const supabase = getSupabaseServer();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }

  const today = todayKeyInTz();

  try {
    // Idempotent — a manual re-trigger on a day the cron already ran just
    // reports what already happened instead of double-trading.
    const { data: existingReport } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("id")
      .eq("report_date", today)
      .maybeSingle();
    if (existingReport) {
      return NextResponse.json({ ok: true, skipped: "already ran today" });
    }

    const { data: fundRow, error: fundErr } = await supabase
      .from(PORTFELL_TABLES.margusFund)
      .select("*")
      .eq("id", "main")
      .single();
    if (fundErr || !fundRow) throw new Error(fundErr?.message ?? "Fund row missing");

    const { data: holdingRows, error: holdingsErr } = await supabase
      .from(PORTFELL_TABLES.margusFundHoldings)
      .select("*")
      .eq("status", "open")
      .order("entry_date", { ascending: true });
    if (holdingsErr) throw new Error(holdingsErr.message);
    const holdings = (holdingRows ?? []) as FundHolding[];

    const { data: recentReportRows } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .select("headline, report_date, portfolio_value")
      .order("report_date", { ascending: false })
      .limit(5);
    const recentHeadlines = (
      (recentReportRows ?? []) as { headline: string; report_date: string }[]
    ).map((r) => `${r.report_date}: ${r.headline}`);
    const previousValue =
      (recentReportRows?.[0] as { portfolio_value?: number } | undefined)
        ?.portfolio_value ?? null;

    const heldTickers = holdings.map((h) => h.ticker);
    const { quotes } = await fetchQuotesWithFallback([...heldTickers, "SPY"]);
    const fearGreed = await fetchFearGreedIndex().catch(() => null);

    let cash = Number(fundRow.cash);
    const pricedHoldings: PricedHolding[] = holdings.map((h) => {
      const q = quotes[h.ticker];
      const price = q?.price ?? h.cost_basis;
      const marketValue = price * h.shares;
      const costValue = h.cost_basis * h.shares;
      return {
        ...h,
        price,
        marketValue,
        unrealizedPnl: marketValue - costValue,
        unrealizedPnlPct: costValue > 0 ? (marketValue - costValue) / costValue : 0,
        daysHeld: daysBetween(h.entry_date, today),
      };
    });
    const totalValueBefore =
      cash + pricedHoldings.reduce((s, h) => s + h.marketValue, 0);

    const spyQuote = quotes.SPY;
    const spyMovePct = spyQuote ? spyQuote.changePercent : null;

    const chain = buildAdvisorProviderChain({ reasoning: true });
    if (chain.length === 0) {
      throw new Error("No LLM provider configured for Upside Portfolio");
    }

    const { object: rawDecision } = await withAdvisorFallback(chain, (model) =>
      generateObject({
        model,
        schema: fundDecisionSchema,
        system: buildFundSystemPrompt(),
        prompt: buildFundUserPrompt({
          today,
          cash,
          holdings: pricedHoldings,
          totalValue: totalValueBefore,
          spyMovePct,
          fearGreed,
          recentHeadlines,
        }),
      })
    );
    const decision = humanizeMargusTree(rawDecision);

    const actions: FundAction[] = [];
    // Running share count per still-open holding, updated as each decision
    // is applied — pricedHoldings itself stays a frozen "start of day"
    // snapshot, so the final portfolio value has to come from this map,
    // not from re-summing the (now stale) pricedHoldings.marketValue.
    const currentShares = new Map<string, number>(
      pricedHoldings.map((h) => [h.id, h.shares])
    );

    for (const dec of decision.holdingDecisions) {
      const holding = pricedHoldings.find(
        (h) => h.ticker.toUpperCase() === dec.ticker.toUpperCase()
      );
      if (!holding) continue; // hallucinated ticker not in book -- skip defensively

      if (dec.action === "hold") {
        actions.push({ type: "hold", ticker: holding.ticker, reasoning: dec.reasoning });
        continue;
      }

      if (dec.action === "exit") {
        const proceeds = holding.shares * holding.price;
        cash += proceeds;
        const realizedPnl = proceeds - holding.shares * holding.cost_basis;
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({
            status: "closed",
            closed_at: today,
            exit_reasoning: dec.reasoning,
            realized_pnl: realizedPnl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", holding.id);
        currentShares.delete(holding.id);
        actions.push({
          type: "exit",
          ticker: holding.ticker,
          reasoning: dec.reasoning,
          shares: holding.shares,
          price: holding.price,
          dollarAmount: proceeds,
        });
        continue;
      }

      const fraction = Math.min(1, Math.max(0, dec.fraction ?? 0));
      if (fraction <= 0) {
        actions.push({ type: "hold", ticker: holding.ticker, reasoning: dec.reasoning });
        continue;
      }

      if (dec.action === "trim") {
        const sellShares = Math.min(holding.shares, holding.shares * fraction);
        const proceeds = sellShares * holding.price;
        const newShares = holding.shares - sellShares;
        cash += proceeds;
        currentShares.set(holding.id, newShares);
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({ shares: newShares, updated_at: new Date().toISOString() })
          .eq("id", holding.id);
        actions.push({
          type: "trim",
          ticker: holding.ticker,
          reasoning: dec.reasoning,
          shares: sellShares,
          price: holding.price,
          dollarAmount: proceeds,
        });
      } else if (dec.action === "add") {
        const desiredDollars = holding.marketValue * fraction;
        const affordable = Math.min(desiredDollars, Math.max(0, cash - 100));
        if (affordable < 50) {
          actions.push({
            type: "hold",
            ticker: holding.ticker,
            reasoning: `${dec.reasoning} (wanted to add, but not enough free cash today)`,
          });
          continue;
        }
        const buyShares = affordable / holding.price;
        const newShares = holding.shares + buyShares;
        const newCostBasis =
          (holding.cost_basis * holding.shares + affordable) / newShares;
        cash -= affordable;
        currentShares.set(holding.id, newShares);
        await supabase
          .from(PORTFELL_TABLES.margusFundHoldings)
          .update({
            shares: newShares,
            cost_basis: newCostBasis,
            updated_at: new Date().toISOString(),
          })
          .eq("id", holding.id);
        actions.push({
          type: "add",
          ticker: holding.ticker,
          reasoning: dec.reasoning,
          shares: buyShares,
          price: holding.price,
          dollarAmount: affordable,
        });
      }
    }

    let newPositionsValue = 0;
    for (const idea of decision.newPositions) {
      const ticker = idea.ticker.trim().toUpperCase();
      if (!ticker) continue;
      // Not already priced above (it's a new name) -- fetch it specifically.
      const { quotes: ideaQuotes, sources: ideaSources } =
        await fetchQuotesWithFallback([ticker]);
      const q = ideaQuotes[ticker];
      if (!q || ideaSources[ticker] === "synthetic") {
        actions.push({
          type: "hold",
          ticker,
          reasoning: `Wanted to open ${ticker} (${idea.thesis}) but couldn't get a reliable live price today -- skipping rather than trade on a bad quote.`,
        });
        continue;
      }
      const affordable = Math.min(idea.allocationDollars, Math.max(0, cash - 100));
      if (affordable < 100) {
        actions.push({
          type: "hold",
          ticker,
          reasoning: `Wanted to open ${ticker} but not enough free cash today after other actions.`,
        });
        continue;
      }
      const shares = affordable / q.price;
      const { error: insertErr } = await supabase
        .from(PORTFELL_TABLES.margusFundHoldings)
        .insert({
          ticker,
          shares,
          cost_basis: q.price,
          entry_date: today,
          thesis: idea.thesis,
          target_timeframe: idea.targetTimeframe,
          exit_plan: idea.exitPlan,
          status: "open",
        });
      if (insertErr) {
        await logError({
          source: "server",
          message: `Upside Portfolio: failed to insert new holding ${ticker}: ${insertErr.message}`,
          path: "/api/cron/margus-fund",
        });
        continue;
      }
      cash -= affordable;
      newPositionsValue += affordable;
      actions.push({
        type: "buy",
        ticker,
        reasoning: idea.thesis,
        shares,
        price: q.price,
        dollarAmount: affordable,
      });
    }

    const finalHoldingsValue = pricedHoldings.reduce((sum, h) => {
      const shares = currentShares.get(h.id);
      if (shares === undefined) return sum; // exited today
      return sum + shares * h.price;
    }, 0);
    const totalValueAfter = cash + finalHoldingsValue + newPositionsValue;

    await supabase
      .from(PORTFELL_TABLES.margusFund)
      .update({ cash, updated_at: new Date().toISOString() })
      .eq("id", "main");

    const dayChangeDollar =
      previousValue != null ? totalValueAfter - previousValue : null;
    const dayChangePct =
      previousValue && previousValue > 0
        ? (totalValueAfter - previousValue) / previousValue
        : null;
    const totalReturnPct =
      (totalValueAfter - Number(fundRow.starting_capital)) /
      Number(fundRow.starting_capital);

    const tradedLines = actions
      .filter((a) => a.type !== "hold")
      .map((a) => {
        const verb =
          a.type === "buy"
            ? "Opened"
            : a.type === "exit"
              ? "Exited"
              : a.type === "trim"
                ? "Trimmed"
                : "Added to";
        return `**${verb} ${a.ticker}**: ${a.reasoning}`;
      });
    const holdLines = actions
      .filter((a) => a.type === "hold")
      .map((a) => `*${a.ticker}: ${a.reasoning}*`);

    const bodyLines = [
      decision.marketNote,
      "",
      ...(tradedLines.length > 0 ? tradedLines : ["No trades today."]),
      ...(holdLines.length > 0 ? ["", ...holdLines] : []),
      "",
      decision.closingNote,
    ];

    const { data: report, error: reportErr } = await supabase
      .from(PORTFELL_TABLES.margusFundReports)
      .insert({
        report_date: today,
        headline: decision.headline,
        body: humanizeMargusText(bodyLines.join("\n")),
        actions: humanizeMargusTree(actions),
        portfolio_value: totalValueAfter,
        cash,
        day_change_dollar: dayChangeDollar,
        day_change_pct: dayChangePct,
        total_return_pct: totalReturnPct,
        spy_price: spyQuote?.price ?? null,
      })
      .select()
      .single();
    if (reportErr) throw new Error(reportErr.message);

    // Fire-and-forget-ish: still awaited so logs/errors are captured in
    // this invocation, but wrapped so a recap issue never fails the
    // (already-committed) daily decision above. Uses the start-of-run
    // holdings snapshot (share counts from today's trims/adds aren't
    // reflected) since this is narrative color for the reflection, not
    // the ledger -- but exits ARE filtered out so a position closed
    // today doesn't show up as "still held" in the same recap.
    await maybeGenerateWeeklyRecap(
      supabase,
      today,
      Number(fundRow.starting_capital),
      pricedHoldings.filter((h) => currentShares.has(h.id))
    );

    return NextResponse.json({
      ok: true,
      reportId: report.id,
      totalValue: totalValueAfter,
      cash,
      actions: actions.length,
      headline: decision.headline,
    });
  } catch (err) {
    await logError({
      source: "server",
      message: `Upside Portfolio cron failed: ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : undefined,
      path: "/api/cron/margus-fund",
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upside Portfolio run failed" },
      { status: 500 }
    );
  }
}
