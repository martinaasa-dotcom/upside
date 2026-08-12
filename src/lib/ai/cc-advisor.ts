import { STRATEGY } from "@/lib/calculations";
import { MARGUS_PERSONA } from "@/lib/ai/margus-persona";
import { resolveImportTicker } from "@/lib/ticker";
import { tool } from "ai";
import { z } from "zod";

/** Client context snapshot sent with each chat request */
export type CcChatContext = {
  portfolioName: string;
  cashBalance: number;
  holdings: Array<{
    ticker: string;
    shares: number;
    buyPrice: number;
    price: number;
    cost: number;
    value: number;
    roiPct: number;
    roiDollar: number;
    pctOfTotal: number;
    todayPct: number | null;
    /** Sheet names owning this ticker (Overview aggregate) */
    portfolios?: string[];
    marketState?: string | null;
    preMarketPrice?: number | null;
    preMarketChange?: number | null;
    preMarketChangePercent?: number | null;
    postMarketPrice?: number | null;
    postMarketChange?: number | null;
    postMarketChangePercent?: number | null;
  }>;
  rows: Array<{
    ticker: string;
    spot: number;
    callPct: number;
    stockTarget: number | null;
    distance: number | null;
    nextStrike: number | null;
    contracts: number;
    yield2w: number | null;
    premium: number | null;
    expiration: string | null;
  }>;
  totals: {
    cost: number;
    value: number;
    roiPct: number;
    roiDollar: number;
    yield2wAvg: number;
    premiumTotal: number;
  };
  /** Other sheets (read-only) — for copying Call % / targets / structure */
  otherPortfolios: Array<{
    name: string;
    cashBalance: number;
    holdings: Array<{
      ticker: string;
      shares: number;
      buyPrice: number;
      callPct: number;
      stockTarget: number | null;
    }>;
  }>;
  /** Overview chat: advise only — no mutating tools */
  adviseOnly?: boolean;
  /** Yahoo marketState snapshot (PRE / REGULAR / POST / …) */
  marketState?: string | null;
  /** USD per 1 EUR (Yahoo EURUSD=X) — for broker EUR→USD imports */
  eurUsd?: number | null;
  /** USD per 1 GBP */
  gbpUsd?: number | null;
  /** Not-owned-yet names Margus may discuss without sheet pollution */
  watchlist?: string[];
};

type AdvisorFx = { eurUsd: number | null; gbpUsd: number | null };

function toUsd(
  amount: number,
  currency: "USD" | "EUR" | "GBP",
  fx: AdvisorFx
): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "EUR") {
    return fx.eurUsd && fx.eurUsd > 0 ? amount * fx.eurUsd : amount;
  }
  if (currency === "GBP") {
    return fx.gbpUsd && fx.gbpUsd > 0 ? amount * fx.gbpUsd : amount;
  }
  return amount;
}

export function buildCcAdvisorTools(fx: AdvisorFx = { eurUsd: null, gbpUsd: null }) {
  return {
  setCallPct: tool({
    description:
      "Set the Call % for one ticker. Call % is how far the Next Strike sits above the Stock Target (resistance). Example: stock target $100 and callPct 15 → next strike ~$115.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker symbol, e.g. NBIS"),
      callPct: z
        .number()
        .min(1)
        .max(40)
        .describe("Call percent as a whole number, e.g. 15 for 15%"),
    }),
    execute: async ({ ticker, callPct }) => ({
      action: "set_call_pct" as const,
      ticker: ticker.toUpperCase(),
      callPct: callPct / 100,
      callPctLabel: `${callPct}%`,
      message: `Updated ${ticker.toUpperCase()} Call % to ${callPct}%`,
    }),
  }),

  setCallPctBulk: tool({
    description:
      "Set Call % for several tickers in one step with DIFFERENT percentages per name. Preferred when the user wants safety, risk buffers, or volatility-aware Call % — never flatten everything to one number.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            ticker: z.string(),
            callPct: z.number().min(1).max(40),
          })
        )
        .min(1),
    }),
    execute: async ({ updates }) => ({
      action: "set_call_pct_bulk" as const,
      updates: updates.map((u) => ({
        ticker: u.ticker.toUpperCase(),
        callPct: u.callPct / 100,
        callPctLabel: `${u.callPct}%`,
      })),
      message: `Updated Call % for ${updates.length} ticker(s)`,
    }),
  }),

  setUniformCallPct: tool({
    description:
      "Set the SAME Call % for every ticker. ONLY use when the user explicitly asks for one identical number on all names. NEVER use this for safety, risk, buffer, or volatility requests — those must be per-ticker via setCallPctBulk or proposeWritePlan/applyWritePlan.",
    inputSchema: z.object({
      callPct: z
        .number()
        .min(1)
        .max(40)
        .describe("Call percent as a whole number, e.g. 12 for 12%"),
    }),
    execute: async ({ callPct }) => ({
      action: "set_uniform_call_pct" as const,
      callPct: callPct / 100,
      callPctLabel: `${callPct}%`,
      message: `Set all tickers to Call % ${callPct}%`,
    }),
  }),

  updateHolding: tool({
    description:
      "Update shares and/or buy price for an existing holding. Use for position size or cost-basis edits.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker symbol, e.g. CRWV"),
      shares: z
        .number()
        .positive()
        .optional()
        .describe("New share count (omit to leave unchanged)"),
      buyPrice: z
        .number()
        .positive()
        .optional()
        .describe("New average buy price in USD (omit to leave unchanged)"),
    }),
    execute: async ({ ticker, shares, buyPrice }) => {
      const parts: string[] = [];
      if (shares != null) parts.push(`${shares} shares`);
      if (buyPrice != null) parts.push(`buy $${buyPrice}`);
      return {
        action: "update_holding" as const,
        ticker: ticker.toUpperCase(),
        shares: shares ?? null,
        buyPrice: buyPrice ?? null,
        message: `Updated ${ticker.toUpperCase()}${parts.length ? `: ${parts.join(", ")}` : ""}`,
      };
    },
  }),

  setCash: tool({
    description:
      "Set the portfolio cash balance (can be negative for margin/debt).",
    inputSchema: z.object({
      cash: z.number().describe("Cash balance in USD, e.g. -7000 or 2500"),
    }),
    execute: async ({ cash }) => ({
      action: "set_cash" as const,
      cash,
      message: `Set cash balance to $${cash.toLocaleString()}`,
    }),
  }),

  addHolding: tool({
    description:
      "Add or overwrite ONE holding. Use for single-ticker broker screens (Lightyear detail: Shares + Avg buy). For multi-row portfolio tables use importSheet instead.",
    inputSchema: z.object({
      ticker: z
        .string()
        .describe(
          "Symbol as shown (€RHM → RHM). EU names become Yahoo e.g. RHM.DE when possible."
        ),
      isin: z.string().optional().describe("ISIN if visible"),
      shares: z.number().positive().describe("Share count — keep full decimals"),
      buyPrice: z
        .number()
        .positive()
        .describe("Average buy / cost per share in `currency`"),
      currency: z
        .enum(["USD", "EUR", "GBP"])
        .optional()
        .describe("€ → EUR, $ → USD. Default USD"),
      callPct: z
        .number()
        .min(1)
        .max(40)
        .optional()
        .describe("Optional Call %, default ~15"),
    }),
    execute: async ({ ticker, isin, shares, buyPrice, currency, callPct }) => {
      const resolved = resolveImportTicker(ticker, isin);
      const cur = currency ?? "USD";
      const buyUsd = toUsd(buyPrice, cur, fx);
      return {
        action: "add_holding" as const,
        ticker: resolved,
        shares,
        buyPrice: buyUsd,
        callPct: callPct != null ? callPct / 100 : STRATEGY.defaultCallPct,
        message: `Added ${resolved}: ${shares} @ $${buyUsd.toFixed(2)} (from ${cur} ${buyPrice})`,
      };
    },
  }),

  importSheet: tool({
    description:
      "Import an entire holdings book in ONE call from a spreadsheet OR broker portfolio screenshot (Lightyear, etc.). Include every investment row. Prefer markValue (position value) when average buy/cost is missing — never stall asking for cost basis. Fold multi-currency cash + tiny MMFs into cashUsd. Call once with the full list.",
    inputSchema: z.object({
      cash: z
        .number()
        .optional()
        .describe(
          "Legacy: cash already in USD. Prefer cashUsd / cashNative."
        ),
      cashUsd: z
        .number()
        .optional()
        .describe(
          "Total cash in USD after converting EUR/GBP cash rows + optional tiny MMF residual."
        ),
      cashNative: z
        .number()
        .optional()
        .describe("Cash amount in cashCurrency before FX (e.g. EUR cash total)"),
      cashCurrency: z
        .enum(["USD", "EUR", "GBP"])
        .optional()
        .describe("Currency for cashNative; default USD"),
      replace: z
        .boolean()
        .optional()
        .describe(
          "True for full broker portfolio screenshots — remove tickers on this sheet that are not in holdings. Default true for portfolio-breakdown imports."
        ),
      holdings: z
        .array(
          z.object({
            ticker: z
              .string()
              .describe(
                "Symbol column (RHM, VUAA, GOOGL…). Never CASH / PORTFOLIO / totals / MMF symbols you folded into cash."
              ),
            isin: z
              .string()
              .optional()
              .describe("ISIN if visible — used to pick Yahoo suffix (.DE / .L)"),
            shares: z.number().positive(),
            buyPrice: z
              .number()
              .positive()
              .optional()
              .describe(
                "Average buy/cost per share in `currency` if shown. Omit when the sheet only has market Value."
              ),
            markValue: z
              .number()
              .positive()
              .optional()
              .describe(
                "Position market value in `currency` (Value column). Required when buyPrice is missing — implied cost = markValue / shares."
              ),
            currency: z
              .enum(["USD", "EUR", "GBP"])
              .optional()
              .describe(
                "Native currency of buyPrice/markValue from the Value column (€ → EUR, $ → USD). Default USD."
              ),
            callPct: z
              .number()
              .min(1)
              .max(40)
              .optional()
              .describe("Optional Call % whole number; a volatility-scaled default is used if omitted"),
          })
        )
        .min(1)
        .describe("Every investment / equity / ETF / bond row (not cash lines)"),
    }),
    execute: async ({
      cash,
      cashUsd,
      cashNative,
      cashCurrency,
      replace,
      holdings,
    }) => {
      const SKIP = new Set([
        "CASH",
        "PORTFOLIO",
        "TOTAL",
        "TOTALS",
        "UNREALIZED",
        "UNREALIZED PROFITS",
        "UNREALIZEDPROFIT",
        "INVESTMENTS",
        "MMFS",
        "MONEYMARKET",
      ]);
      const notes: string[] = [];
      const cleaned: Array<{
        ticker: string;
        shares: number;
        buyPrice: number;
        callPct: number;
      }> = [];

      for (const h of holdings) {
        const ticker = resolveImportTicker(h.ticker, h.isin);
        if (
          !ticker ||
          SKIP.has(ticker) ||
          SKIP.has(h.ticker.trim().toUpperCase()) ||
          ticker.startsWith("UNREALIZED") ||
          ticker.startsWith("CASH")
        ) {
          continue;
        }
        if (!Number.isFinite(h.shares) || h.shares <= 0) continue;

        const currency = h.currency ?? "USD";
        let buyNative: number | null = null;
        if (h.buyPrice != null && h.buyPrice > 0) buyNative = h.buyPrice;
        else if (h.markValue != null && h.markValue > 0) {
          buyNative = h.markValue / h.shares;
          notes.push(`${ticker} cost←mark`);
        }
        if (buyNative == null || !(buyNative > 0)) {
          notes.push(`skipped ${ticker} (no buy/mark)`);
          continue;
        }

        const buyPrice = toUsd(buyNative, currency, fx);
        if (
          currency !== "USD" &&
          ((currency === "EUR" && !(fx.eurUsd && fx.eurUsd > 0)) ||
            (currency === "GBP" && !(fx.gbpUsd && fx.gbpUsd > 0)))
        ) {
          notes.push(`${ticker} FX missing — stored 1:1 as USD`);
        }

        cleaned.push({
          ticker,
          shares: h.shares,
          buyPrice,
          callPct: h.callPct != null ? h.callPct / 100 : STRATEGY.defaultCallPct,
        });
      }

      const byTicker = new Map<string, (typeof cleaned)[number]>();
      for (const row of cleaned) byTicker.set(row.ticker, row);
      const rows = [...byTicker.values()];
      const tickers = rows.map((h) => h.ticker);

      let resolvedCash: number | null = null;
      if (cashUsd != null && Number.isFinite(cashUsd)) resolvedCash = cashUsd;
      else if (cashNative != null && Number.isFinite(cashNative)) {
        resolvedCash = toUsd(cashNative, cashCurrency ?? "USD", fx);
      } else if (cash != null && Number.isFinite(cash)) resolvedCash = cash;

      const replaceBook = replace !== false;

      return {
        action: "import_sheet" as const,
        cash: resolvedCash,
        replace: replaceBook,
        holdings: rows,
        message: `Imported ${rows.length} holding${rows.length === 1 ? "" : "s"}${
          resolvedCash != null
            ? ` + cash $${resolvedCash.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
            : ""
        }${replaceBook ? " (replace sheet)" : ""}: ${tickers.join(", ")}${
          notes.length ? ` · ${notes.slice(0, 6).join("; ")}` : ""
        }`,
      };
    },
  }),

  removeHolding: tool({
    description: "Remove a ticker from the portfolio holdings.",
    inputSchema: z.object({
      ticker: z.string().describe("Ticker to remove"),
    }),
    execute: async ({ ticker }) => ({
      action: "remove_holding" as const,
      ticker: ticker.toUpperCase(),
      message: `Removed ${ticker.toUpperCase()} from holdings`,
    }),
  }),

  setStockTarget: tool({
    description:
      "Set the Stock Target price for one ticker (the price level you want to write covered calls toward). Overrides the auto resistance model. Next Strike = Stock Target × (1 + Call %).",
    inputSchema: z.object({
      ticker: z.string(),
      stockTarget: z
        .number()
        .positive()
        .describe("Stock target price in USD, e.g. 110"),
    }),
    execute: async ({ ticker, stockTarget }) => ({
      action: "set_stock_target" as const,
      ticker: ticker.toUpperCase(),
      stockTarget,
      message: `Set ${ticker.toUpperCase()} Stock Target to $${stockTarget}`,
    }),
  }),

  setStockTargetBulk: tool({
    description:
      "Set Stock Target prices for several tickers at once. Use when picking write levels across the book.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            ticker: z.string(),
            stockTarget: z.number().positive(),
          })
        )
        .min(1),
    }),
    execute: async ({ updates }) => ({
      action: "set_stock_target_bulk" as const,
      updates: updates.map((u) => ({
        ticker: u.ticker.toUpperCase(),
        stockTarget: u.stockTarget,
      })),
      message: `Updated Stock Target for ${updates.length} ticker(s)`,
    }),
  }),

  clearStockTarget: tool({
    description:
      "Clear a manual Stock Target override so the ticker goes back to the auto resistance model.",
    inputSchema: z.object({
      ticker: z.string(),
    }),
    execute: async ({ ticker }) => ({
      action: "clear_stock_target" as const,
      ticker: ticker.toUpperCase(),
      message: `Cleared ${ticker.toUpperCase()} Stock Target override (back to auto)`,
    }),
  }),

  proposeWritePlan: tool({
    description:
      "Analyze covered-call setups (expiry, yield, strikes). For critiques of the CURRENT table plan, ALWAYS pass each position's stockTarget + callPct from the covered-call rows so you do not overwrite manual targets. Only omit stockTarget/callPct when the user asks to re-pick targets from local highs / resistance.",
    inputSchema: z.object({
      positions: z
        .array(
          z.object({
            ticker: z.string(),
            shares: z.number().positive(),
            spot: z.number().positive().optional(),
            stockTarget: z
              .number()
              .positive()
              .optional()
              .describe(
                "Current table Stock Target — pass this when critiquing/analyzing the existing plan"
              ),
            callPct: z
              .number()
              .min(1)
              .max(40)
              .optional()
              .describe(
                "Current table Call % as whole number e.g. 18 for 18% — pass when critiquing existing plan"
              ),
          })
        )
        .min(1),
    }),
    execute: async ({ positions }) => {
      const { buildWritePlans } = await import("@/lib/market/write-plan");
      const plans = await buildWritePlans(
        positions.map((p) => ({
          ticker: p.ticker,
          shares: p.shares,
          spot: p.spot,
          stockTarget: p.stockTarget,
          callPct: p.callPct,
        }))
      );
      return {
        action: "propose_write_plan" as const,
        plans,
        message: plans.map((p) => p.summary).join("\n"),
      };
    },
  }),

  applyWritePlan: tool({
    description:
      "Apply Stock Target + Call % from a write plan (after proposeWritePlan). Does not change shares. Pass callPct as whole number e.g. 15 for 15%.",
    inputSchema: z.object({
      updates: z
        .array(
          z.object({
            ticker: z.string(),
            stockTarget: z.number().positive(),
            callPct: z.number().min(1).max(40),
          })
        )
        .min(1),
    }),
    execute: async ({ updates }) => ({
      action: "apply_write_plan" as const,
      updates: updates.map((u) => ({
        ticker: u.ticker.toUpperCase(),
        stockTarget: u.stockTarget,
        callPct: u.callPct / 100,
      })),
      message: `Applied write plan to ${updates.length} ticker(s)`,
    }),
  }),
};
}

export const ccAdvisorTools = buildCcAdvisorTools();

export type CcAdvisorTools = ReturnType<typeof buildCcAdvisorTools>;

function fmtPctLabel(pct: number | null | undefined): string {
  if (pct == null || Number.isNaN(pct)) return "—";
  return `${(pct * 100).toFixed(2)}%`;
}

function fmtPriceLabel(price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return "—";
  return String(price);
}

function holdingExtendedHoursLine(h: CcChatContext["holdings"][number]): string {
  const bits: string[] = [];
  if (h.marketState) bits.push(`session=${h.marketState}`);
  if (h.preMarketPrice != null || h.preMarketChangePercent != null) {
    bits.push(
      `preMarket=${fmtPriceLabel(h.preMarketPrice)} (${fmtPctLabel(h.preMarketChangePercent)})`
    );
  }
  if (h.postMarketPrice != null || h.postMarketChangePercent != null) {
    bits.push(
      `afterHours=${fmtPriceLabel(h.postMarketPrice)} (${fmtPctLabel(h.postMarketChangePercent)})`
    );
  }
  return bits.length ? `, ${bits.join(", ")}` : "";
}

export function buildCcSystemPrompt(ctx: CcChatContext): string {
  const holdingsTable =
    ctx.holdings.length === 0
      ? "(no holdings)"
      : ctx.holdings
          .map((h) => {
            const sheets =
              h.portfolios && h.portfolios.length
                ? ` sheets=[${h.portfolios.join(",")}]`
                : "";
            return `${h.ticker}${sheets}: shares=${h.shares}, buy=${h.buyPrice}, price=${h.price}, cost=${h.cost.toFixed(0)}, value=${h.value.toFixed(0)}, roi%=${(h.roiPct * 100).toFixed(1)}%, roi$=${h.roiDollar.toFixed(0)}, pctTotal=${(h.pctOfTotal * 100).toFixed(1)}%, today=${h.todayPct != null ? (h.todayPct * 100).toFixed(1) + "%" : "—"}${holdingExtendedHoursLine(h)}`;
          })
          .join("\n");

  const ccTable =
    ctx.rows.length === 0
      ? "(no CC rows)"
      : ctx.rows
          .map((r) => {
            const strikeOtm =
              r.nextStrike != null && r.spot > 0
                ? (r.nextStrike - r.spot) / r.spot
                : null;
            return `${r.ticker}: spot=${r.spot}, call%=${(r.callPct * 100).toFixed(0)}%, stockTarget=${r.stockTarget ?? "—"}, distanceToTarget=${r.distance != null ? (r.distance * 100).toFixed(1) + "%" : "—"}, nextStrike=${r.nextStrike ?? "—"}, strikeOtmFromSpot=${strikeOtm != null ? (strikeOtm * 100).toFixed(1) + "%" : "—"}, contracts=${r.contracts}, ccYield=${r.yield2w != null ? (r.yield2w * 100).toFixed(2) + "%" : "—"}, premium=${r.premium ?? "—"}, exp=${r.expiration ?? "—"}`;
          })
          .join("\n");

  const otherSheets =
    (ctx.otherPortfolios ?? []).length === 0
      ? "(none)"
      : ctx.otherPortfolios
          .map((p) => {
            const lines =
              p.holdings.length === 0
                ? "  (no holdings)"
                : p.holdings
                    .map(
                      (h) =>
                        `  ${h.ticker}: shares=${h.shares}, buy=${h.buyPrice}, call%=${(h.callPct * 100).toFixed(0)}%, stockTarget=${h.stockTarget ?? "—"}`
                    )
                    .join("\n");
            return `${p.name} (cash=${p.cashBalance}):\n${lines}`;
          })
          .join("\n\n");

  const adviseOnly = Boolean(ctx.adviseOnly);

  const writeBlock = adviseOnly
    ? `This is OVERVIEW mode (advise-only).
You can READ all portfolios below and discuss winners, losers, concentration, Call %, and strategy.
You MUST NOT claim to change any sheet. There are NO write tools in this mode.
If the user asks to edit holdings, cash, Call %, or targets: tell them to open that portfolio tab and ask again there.`
    : `You can READ holdings + covered-call data below, and WRITE via tools:
- Holdings: importSheet (preferred for screenshots / multi-ticker imports), updateHolding, addHolding, removeHolding, setCash
- Covered calls: setCallPct, setCallPctBulk, setUniformCallPct
- Stock targets: setStockTarget, setStockTargetBulk, clearStockTarget
- Write planning: proposeWritePlan (analyze), applyWritePlan (commit targets + Call %)

Tools ALWAYS apply to the ACTIVE portfolio (${ctx.portfolioName}) only.
You can READ other sheets listed under "Other portfolios" (e.g. Aasad while chatting on MaryAnn) when the user asks about them or wants to copy.
When the user asks to copy / mirror / adapt strategy from another sheet:
1. Pull Call %, stock targets, and/or structure from that sheet.
2. Apply to matching tickers on ${ctx.portfolioName} via tools — keep THIS sheet's share counts and cash unless they explicitly ask to copy size too.
3. Skip tickers that don't exist here unless they ask to add them.
4. Briefly summarize what you copied vs skipped.

When the user pastes or attaches a screenshot (spreadsheet, broker app, portfolio table, OR single-ticker detail) or asks to import holdings:

**A) Single-ticker broker detail screen** (Lightyear etc. — big symbol like €RHM, fields Shares / Avg buy / Invested / chart):
1. Read ticker (strip €/$ prefix), Shares (full decimals), Avg buy (cost basis — NOT the live market price at the top).
2. Currency from € → EUR, $ → USD.
3. Call addHolding ONCE with ticker, shares, buyPrice=Avg buy, currency. Example: RHM, 2.889580565, buyPrice 1239.69, currency EUR → Yahoo RHM.DE.
4. Do NOT use the live spot as buyPrice. Do NOT refuse. Do NOT ask clarifying questions first — tool first, then confirm.
5. replace is NOT needed; upsert this one name only.

**B) Multi-row portfolio / breakdown table**:
1. Call importSheet ONCE with EVERY investment row — never stop after the first ticker, never chain addHolding instead.
2. If Quantity + Value but NO Avg buy: set markValue = Value and currency from €/$. buyPrice optional.
3. Pass isin when visible (RHM + DE ISIN → RHM.DE). US ISINs stay bare.
4. Cash: sum Cash-EUR/USD/GBP (cashNative+cashCurrency or cashUsd). Tiny MMFs → fold into cash.
5. Skip headers/totals. replace=true for full books.
6. Prefer importSheet over a chain of addHolding / setCash.

After ANY import tool: reply in 2–4 sentences confirming ticker, shares, USD cost — never go silent.

FX for imports (USD per 1 unit): EURUSD=${ctx.eurUsd != null ? ctx.eurUsd.toFixed(4) : "unknown"} · GBPUSD=${ctx.gbpUsd != null ? ctx.gbpUsd.toFixed(4) : "unknown"}.`;

  return `${MARGUS_PERSONA}

This chat thread is for Upside portfolio "${ctx.portfolioName}" only.
Do not assume prior talk about other sheets unless the user brings them up. Each sheet has its own conversation.

${writeBlock}

When the user asks to critique / review / advise on the CURRENT plan (or “current targets”):
1. Use the Covered-call rows snapshot as ground truth (and/or proposeWritePlan WITH stockTarget+callPct passed through).
2. Critique those exact levels — do NOT invent new Stock Targets or Call %.
3. Do NOT call applyWritePlan / setStockTarget unless they ask to change something.
4. Speak using the column names correctly (see glossary). Never call Distance “OTM to strike”.

When the user asks to pick NEW stock targets, re-find local highs, or rebuild the plan from scratch:
1. Call proposeWritePlan with ticker + shares + spot only (omit stockTarget/callPct so resistance/vol can re-pick).
2. Summarize recommendations; apply only if they ask.

### Covered Call Targets — column glossary (memorize this)
This table is the WRITE PLAN, not a generic options chain dump.

1. **Spot / price** — regular-session last (or best available). For overnight / gap talk use preMarket* and afterHours* fields.
2. **Stock Target** — the price level you are writing *toward* (resistance / local high / manual level). It is NOT the option strike.
3. **Call %** — safety buffer ABOVE Stock Target. Volatility-scaled. Example: target $100 + Call 15% → Next Strike $115.
4. **Distance** — how far Spot is from Stock Target = (Stock Target − Spot) / Spot.
   - Positive = Spot still below target (room to run into the write level).
   - Negative = Spot already above / through the target (plan is stale or aggressive).
   - Distance is NOT option OTM % and NOT Call %.
5. **Next Strike** — the actual call strike you aim to sell = Stock Target × (1 + Call %).
6. **strikeOtmFromSpot** — how far Next Strike is above Spot = (Next Strike − Spot) / Spot. THIS is the true OTM % for premium talk.
7. **Contracts** — floor(shares / 100).
8. **CC yield / Premium** — live mid for that Next Strike & expiry ÷ Spot (and total $ for all contracts).
9. **Expiration** — chosen ~2–3 week expiry (earnings-aware).
10. **preMarket / afterHours** — extended-hours last price and % vs prior close when Yahoo has them. Use these when the user asks about premarket, after-hours, overnight gaps, or “what’s moving before the open”. Format as a real Markdown table (one row per line) or tight bullets — never a single jammed pipe paragraph.
11. **session / marketState** — Yahoo session flag (PREPRE, PRE, REGULAR, POST, POSTPOST, CLOSED, …). When PRE/PREPRE lean on preMarket; when POST/POSTPOST lean on afterHours.

Example (do not confuse these):
- Spot $188, Stock Target $205, Call 22% → Distance ≈ +9% (to target), Next Strike ≈ $250, strikeOtmFromSpot ≈ +33%.
- Saying “9% OTM premium” is WRONG here — 9% is Distance to target; the strike is ~33% OTM.

When critiquing, discuss:
- Is Stock Target still a sensible write level vs Spot / local highs?
- Is Call % right for this ticker's realized volatility?
- Is strikeOtmFromSpot so far that premium/CC yield is junk → maybe tighten Call % or raise realism of target?
- Earnings vs Expiration.
- Never “fix” Distance by calling it strike OTM.

Covered-call strategy:
- Prefer intraday green rebound to sell.
- Expiry: ${STRATEGY.minDaysPreferred}–${STRATEGY.maxDaysPreferred} days (~2–3 weeks); up to ~${STRATEGY.maxDaysExtended}d if earnings forces a longer dated.
- Prefer expire BEFORE earnings when possible; otherwise go past earnings and widen Call %.
- Call % MUST always reflect each name's own realized volatility / beta — never a flat portfolio-wide default.
  · Low-vol / defensive names: about ${(STRATEGY.callPctSafeMin * 100).toFixed(0)}–${(STRATEGY.callPctSafeMax * 100).toFixed(0)}%.
  · Typical growth names: around ${(STRATEGY.callPctSafeMax * 100).toFixed(0)}–${(STRATEGY.callPctMid * 100).toFixed(0)}%.
  · High-beta / speculative names: around ${(STRATEGY.callPctMid * 100).toFixed(0)}–${(STRATEGY.callPctHighBeta * 100).toFixed(0)}%.
  · "I want safety" means scale UP high-beta names and keep calm names near their own vol-implied level — NOT setUniformCallPct to one number for everything.
  · Prefer proposeWritePlan or setCallPctBulk with per-ticker values, each reasoned from that name's own realized volatility (higher vol → wider Call %). Explain the vol rationale briefly.
  · Still nudge Call % for earnings and distance to stock target after the vol baseline.
- Target ~${(STRATEGY.targetYield * 100).toFixed(0)}% period yield (floor ~${(STRATEGY.minYield * 100).toFixed(0)}%).
- Execution: ${STRATEGY.executionWindow}.

Be concise. Prefer tools over invented numbers. After tools, briefly confirm.
None of this is personalized investment advice — you're reasoning about the numbers already on the sheet, not recommending trades for the user's specific financial situation.

Market session: ${ctx.marketState ?? "unknown"}
Watchlist (not owned — discuss freely, do not invent sheet positions): ${(ctx.watchlist ?? []).join(", ") || "(none)"}
Cash: ${ctx.cashBalance}
Portfolio totals: cost=${ctx.totals.cost.toFixed(0)}, value=${ctx.totals.value.toFixed(0)}, roi%=${(ctx.totals.roiPct * 100).toFixed(1)}%, roi$=${ctx.totals.roiDollar.toFixed(0)}, ccYieldAvg=${(ctx.totals.yield2wAvg * 100).toFixed(2)}%, premiumTotal=${ctx.totals.premiumTotal.toFixed(2)}

Holdings (includes preMarket / afterHours when available):
${holdingsTable}

Covered-call rows:
${ccTable}

Other portfolios (read-only — copy source):
${otherSheets}`;
}
