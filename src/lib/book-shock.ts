/**
 * Macro shock scenarios with per-ticker thematic and factor sensitivities.
 * Betas and factor sensitivities reflect asset-specific drivers (valuation duration,
 * AI capital expenditure, crypto cycles, energy demand, and FX exposure).
 */

export type ShockId =
  | "none"
  | "rates_up"
  | "tech_pullback10"
  | "oil_shock25"
  | "ai_down20"
  | "btc_winter35"
  | "broad_down15"
  | "usd_surge7"
  | "china_supply_shock"
  | "soft_landing_rally";

export type MacroShockCategory =
  | "Rates & Duration"
  | "Tech Valuation"
  | "Commodities"
  | "AI Infrastructure"
  | "Digital Assets"
  | "Liquidity"
  | "Foreign Exchange"
  | "Supply Chain"
  | "Risk Expansion"
  | "Baseline";

export type ShockDefinition = {
  id: ShockId;
  label: string;
  shortLabel: string;
  tagline: string;
  driver: MacroShockCategory;
  /** Headline move applied to the core driver (e.g. -0.20 for -20%) */
  headlinePct: number;
  /** Concise PM context on what triggers the shock and why */
  mechanism: string;
  /** Actionable checklist / tactical takeaway (dash-free) */
  tacticalAction: string;
};

export const SHOCKS: ShockDefinition[] = [
  {
    id: "none",
    label: "No shock",
    shortLabel: "Live",
    tagline: "Live marks without stress testing.",
    driver: "Baseline",
    headlinePct: 0,
    mechanism: "Current market marks without hypothetical macro shifts.",
    tacticalAction: "Baseline portfolio value and current leverage.",
  },
  {
    id: "rates_up",
    label: "Rates +75 bps",
    shortLabel: "Rates +75bps",
    tagline: "10Y yield jumps; duration and high-multiple growth compress.",
    driver: "Rates & Duration",
    headlinePct: -0.12,
    mechanism: "Higher cost of capital compresses valuation multiples for unprofitable tech and long-duration growth. Power producers and cash are resilient.",
    tacticalAction: "Review margin interest carry costs. High-multiple growth absorbs the heaviest multiple compression.",
  },
  {
    id: "tech_pullback10",
    label: "Tech pullback −10%",
    shortLabel: "Tech −10%",
    tagline: "Valuation reset across mega-cap tech, AI cloud, and semis.",
    driver: "Tech Valuation",
    headlinePct: -0.10,
    mechanism: "Broad tech multiple reset across software, cloud platforms, and semiconductors. Defensives, energy, and cash provide relative insulation.",
    tacticalAction: "Covered call strikes gain downside safety. Opportunity to deploy dry powder into high-conviction tech leaders.",
  },
  {
    id: "oil_shock25",
    label: "Oil shock +25%",
    shortLabel: "Oil +25%",
    tagline: "Commodities surge; power producers gain while consumer tech absorbs cost drag.",
    driver: "Commodities",
    headlinePct: 0.25,
    mechanism: "Supply constraints drive oil and energy higher. Power generation assets like VST and PWR benefit, while tech and consumer discretionary face input cost inflation.",
    tacticalAction: "Energy and grid power serve as natural shock absorbers. Monitor consumer tech margin compression.",
  },
  {
    id: "ai_down20",
    label: "AI −20%",
    shortLabel: "AI −20%",
    tagline: "GPU cloud, semis, AI software, and AI power (VST/PWR), sized by AI beta.",
    driver: "AI Infrastructure",
    headlinePct: -0.20,
    mechanism: "CapEx digestion or enterprise AI monetization pause hits GPU cloud, chip fabricators, AI software, and data center power demand.",
    tacticalAction: "Check concentration in AI infrastructure. Stagger covered call strikes above resistance.",
  },
  {
    id: "btc_winter35",
    label: "Crypto winter −35%",
    shortLabel: "Crypto −35%",
    tagline: "Crypto treasuries hardest; high-beta AI/growth and fintech follow on risk-off.",
    driver: "Digital Assets",
    headlinePct: -0.35,
    mechanism: "Sharp Bitcoin liquidity drawdown hits crypto treasury holders, miners, and exchanges hardest, spilling into high-beta fintech and retail growth.",
    tacticalAction: "Verify margin debt thresholds. Crypto proxies face sharp volatility swings.",
  },
  {
    id: "broad_down15",
    label: "Broad −15%",
    shortLabel: "Flash −15%",
    tagline: "Uniform mark-down across the selected book.",
    driver: "Liquidity",
    headlinePct: -0.15,
    mechanism: "Systemic risk-off liquidity squeeze where correlation moves toward 1 across all equity holdings.",
    tacticalAction: "Cash buffer preserves nominal capital and expands purchasing power for rebound deployment.",
  },
  {
    id: "usd_surge7",
    label: "Dollar surge +7%",
    shortLabel: "DXY +7%",
    tagline: "DXY spikes; European ADRs and foreign revenues face currency drag.",
    driver: "Foreign Exchange",
    headlinePct: 0.07,
    mechanism: "Surging US Dollar creates translation headwinds for European equities and US multinationals with high overseas revenue.",
    tacticalAction: "Pure domestic US infrastructure assets show strong resilience against foreign currency swings.",
  },
  {
    id: "china_supply_shock",
    label: "Semi supply drag",
    shortLabel: "Supply drag",
    tagline: "Asia foundry bottlenecks hit chips and lithography; domestic cloud is sheltered.",
    driver: "Supply Chain",
    headlinePct: -0.15,
    mechanism: "Geopolitical or trade friction in Asian hardware manufacturing impacts foundries and chip packaging. Domestic enterprise software and energy stay insulated.",
    tacticalAction: "Software and domestic grid power act as defensive shields against physical hardware disruption.",
  },
  {
    id: "soft_landing_rally",
    label: "Risk rally +12%",
    shortLabel: "Rally +12%",
    tagline: "Soft landing relief rally led by high-beta growth, fintech, space, and crypto.",
    driver: "Risk Expansion",
    headlinePct: 0.12,
    mechanism: "Inflation cools without a recession, triggering rate-cut optimism and strong capital inflows into growth, tech, and speculative momentum.",
    tacticalAction: "High-beta holdings lead the charge. Watch covered call strikes approaching in-the-money territory.",
  },
];

export type TickerShockProfile = {
  /** Short theme label shown in the shock table */
  label: string;
  /** Sensitivity to AI digester (−20% at beta 1) */
  ai: number;
  /** Sensitivity to crypto winter (−35% at beta 1); includes risk-off correlation */
  crypto: number;
  /** Sensitivity to rates bite (negative = hurt when rates up) */
  rates: number;
  /** Sensitivity to energy & commodity prices (positive = energy / power producers benefit) */
  energy?: number;
  /** Sensitivity to strong USD / foreign revenue (negative = hurt by rising dollar) */
  fx?: number;
  /** Broad market beta (SPY = 1.0) */
  beta?: number;
  /** Sensitivity to Asia hardware / foundry supply chain friction */
  supplyChain?: number;
};

/**
 * Canonical profiles for Upside book names + common adjacents.
 * Unknown tickers fall back to a dynamic classifier.
 */
const PROFILES: Record<string, TickerShockProfile> = {
  // AI infra / neo-cloud
  NBIS: { label: "AI infra / GPU cloud", ai: 1, crypto: 0.5, rates: -1, energy: -0.35, fx: -0.2, beta: 1.7, supplyChain: 0.5 },
  CRWV: { label: "AI infra / neo-cloud", ai: 1, crypto: 0.48, rates: -0.95, energy: -0.35, fx: -0.2, beta: 1.65, supplyChain: 0.5 },

  // Semis / AI chips
  NVDA: { label: "Semis / AI chips", ai: 1, crypto: 0.38, rates: -0.9, energy: -0.3, fx: -0.5, beta: 1.6, supplyChain: 0.85 },
  AVGO: { label: "Semis / AI interconnect", ai: 0.95, crypto: 0.32, rates: -0.85, energy: -0.25, fx: -0.5, beta: 1.4, supplyChain: 0.8 },
  TSM: { label: "Semis / foundry", ai: 0.9, crypto: 0.3, rates: -0.8, energy: -0.25, fx: -0.65, beta: 1.35, supplyChain: 1.0 },
  ASML: { label: "Semis / lithography", ai: 0.85, crypto: 0.28, rates: -0.75, energy: -0.2, fx: -0.9, beta: 1.3, supplyChain: 0.95 },
  "ASML.AS": { label: "Semis / lithography", ai: 0.85, crypto: 0.28, rates: -0.75, energy: -0.2, fx: -0.9, beta: 1.3, supplyChain: 0.95 },
  "SMH.L": { label: "Semis ETF", ai: 0.9, crypto: 0.3, rates: -0.8, energy: -0.25, fx: -0.8, beta: 1.45, supplyChain: 0.85 },
  AMD: { label: "Semis / AI compute", ai: 0.9, crypto: 0.35, rates: -0.85, energy: -0.3, fx: -0.45, beta: 1.55, supplyChain: 0.8 },
  INTC: { label: "Semis / foundry turnaround", ai: 0.6, crypto: 0.2, rates: -0.65, energy: -0.2, fx: -0.4, beta: 1.1, supplyChain: 0.7 },

  // AI software / platforms
  PLTR: { label: "AI software / data", ai: 0.9, crypto: 0.35, rates: -0.85, energy: -0.15, fx: -0.25, beta: 1.4, supplyChain: 0.15 },
  NOW: { label: "Enterprise / AI software", ai: 0.75, crypto: 0.28, rates: -0.7, energy: -0.15, fx: -0.35, beta: 1.25, supplyChain: 0.15 },
  GOOGL: { label: "Big tech / AI spend", ai: 0.55, crypto: 0.28, rates: -0.55, energy: -0.2, fx: -0.5, beta: 1.15, supplyChain: 0.3 },
  "ABEA.DE": { label: "Big tech / AI spend", ai: 0.55, crypto: 0.28, rates: -0.55, energy: -0.2, fx: -0.85, beta: 1.15, supplyChain: 0.3 },
  MSFT: { label: "Enterprise cloud / AI", ai: 0.7, crypto: 0.22, rates: -0.6, energy: -0.2, fx: -0.45, beta: 1.1, supplyChain: 0.3 },
  AAPL: { label: "Consumer tech / hardware", ai: 0.5, crypto: 0.18, rates: -0.5, energy: -0.25, fx: -0.55, beta: 1.05, supplyChain: 0.75 },
  AMZN: { label: "Cloud infra / ecommerce", ai: 0.65, crypto: 0.25, rates: -0.65, energy: -0.4, fx: -0.4, beta: 1.2, supplyChain: 0.4 },
  META: { label: "AI social / advertising", ai: 0.75, crypto: 0.25, rates: -0.6, energy: -0.2, fx: -0.45, beta: 1.3, supplyChain: 0.2 },

  // AI power stack (data center electricity + buildout)
  VST: { label: "AI power / generation", ai: 0.85, crypto: 0.3, rates: -0.25, energy: 0.7, fx: -0.1, beta: 1.2, supplyChain: 0.2 },
  PWR: { label: "AI power / grid infra", ai: 0.8, crypto: 0.28, rates: -0.3, energy: 0.6, fx: -0.1, beta: 1.15, supplyChain: 0.35 },

  // Crypto complex
  BMNR: { label: "Crypto / BTC treasury", ai: 0.2, crypto: 1, rates: -0.75, energy: -0.3, fx: -0.2, beta: 2.2, supplyChain: 0.2 },
  MSTR: { label: "Crypto / BTC treasury", ai: 0.15, crypto: 1, rates: -0.8, energy: -0.3, fx: -0.2, beta: 2.3, supplyChain: 0.2 },
  COIN: { label: "Crypto exchange", ai: 0.25, crypto: 0.95, rates: -0.7, energy: -0.25, fx: -0.3, beta: 2.1, supplyChain: 0.15 },
  MARA: { label: "Crypto miner", ai: 0.15, crypto: 0.95, rates: -0.75, energy: -0.45, fx: -0.15, beta: 2.4, supplyChain: 0.3 },
  RIOT: { label: "Crypto miner", ai: 0.15, crypto: 0.95, rates: -0.75, energy: -0.45, fx: -0.15, beta: 2.4, supplyChain: 0.3 },

  // Speculative growth / space / mobility
  RKLB: { label: "Space / aerospace", ai: 0.2, crypto: 0.42, rates: -0.85, energy: -0.3, fx: -0.2, beta: 1.8, supplyChain: 0.5 },
  TSLA: { label: "EV / robotics / autonomy", ai: 0.7, crypto: 0.55, rates: -0.8, energy: -0.35, fx: -0.5, beta: 1.9, supplyChain: 0.65 },

  // Fintech
  HOOD: { label: "Fintech / brokerage", ai: 0.25, crypto: 0.55, rates: -0.65, energy: -0.2, fx: -0.2, beta: 1.5, supplyChain: 0.1 },
  SOFI: { label: "Fintech / consumer lending", ai: 0.2, crypto: 0.4, rates: -0.6, energy: -0.2, fx: -0.1, beta: 1.45, supplyChain: 0.1 },

  // Consumer internet & media
  RDDT: { label: "Consumer internet", ai: 0.3, crypto: 0.3, rates: -0.55, energy: -0.15, fx: -0.2, beta: 1.3, supplyChain: 0.1 },
  NFLX: { label: "Streaming / entertainment", ai: 0.35, crypto: 0.15, rates: -0.5, energy: -0.15, fx: -0.5, beta: 1.1, supplyChain: 0.1 },
  UBER: { label: "Mobility / platform", ai: 0.4, crypto: 0.2, rates: -0.55, energy: -0.6, fx: -0.4, beta: 1.25, supplyChain: 0.1 },

  // Defence
  "RHM.DE": { label: "European defence", ai: 0.15, crypto: 0.15, rates: -0.25, energy: 0.3, fx: -0.85, beta: 0.85, supplyChain: 0.4 },

  // Energy & Industrials
  XLE: { label: "Energy sector ETF", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 1.0, fx: -0.3, beta: 0.8, supplyChain: 0.2 },
  XOM: { label: "Energy / oil major", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 0.95, fx: -0.4, beta: 0.75, supplyChain: 0.2 },
  CVX: { label: "Energy / oil major", ai: 0.05, crypto: 0.1, rates: 0.1, energy: 0.95, fx: -0.4, beta: 0.75, supplyChain: 0.2 },

  // Healthcare / Quality Value
  LLY: { label: "Pharma / GLP-1 healthcare", ai: 0.2, crypto: 0.05, rates: -0.3, energy: -0.1, fx: -0.45, beta: 0.65, supplyChain: 0.3 },
  UNH: { label: "Healthcare / insurance", ai: 0.1, crypto: 0.05, rates: -0.2, energy: -0.1, fx: -0.1, beta: 0.55, supplyChain: 0.1 },
  JNJ: { label: "Healthcare / defensive", ai: 0.05, crypto: 0.05, rates: -0.15, energy: -0.1, fx: -0.4, beta: 0.45, supplyChain: 0.2 },
  JPM: { label: "Diversified banking", ai: 0.25, crypto: 0.15, rates: 0.15, energy: 0.1, fx: -0.3, beta: 0.95, supplyChain: 0.1 },
  V: { label: "Payment network", ai: 0.3, crypto: 0.2, rates: -0.45, energy: -0.15, fx: -0.5, beta: 0.9, supplyChain: 0.1 },
  MA: { label: "Payment network", ai: 0.3, crypto: 0.2, rates: -0.45, energy: -0.15, fx: -0.5, beta: 0.9, supplyChain: 0.1 },
  "BRK.B": { label: "Conglomerate / value", ai: 0.15, crypto: 0.05, rates: 0.1, energy: 0.3, fx: -0.2, beta: 0.65, supplyChain: 0.15 },

  // Indexes / broad
  SPY: { label: "US large-cap index", ai: 0.25, crypto: 0.22, rates: -0.4, energy: -0.2, fx: -0.35, beta: 1.0, supplyChain: 0.3 },
  QQQ: { label: "US tech index", ai: 0.65, crypto: 0.28, rates: -0.65, energy: -0.25, fx: -0.45, beta: 1.2, supplyChain: 0.45 },
  IWM: { label: "US small-cap index", ai: 0.2, crypto: 0.35, rates: -0.85, energy: -0.35, fx: -0.1, beta: 1.25, supplyChain: 0.25 },
  TLT: { label: "US 20Y treasury ETF", ai: 0.0, crypto: 0.0, rates: -1.2, energy: -0.1, fx: 0.0, beta: 0.3, supplyChain: 0.0 },
  "CSPX.L": { label: "US large-cap index", ai: 0.25, crypto: 0.22, rates: -0.4, energy: -0.2, fx: -0.8, beta: 1.0, supplyChain: 0.3 },
  "VWCE.DE": { label: "Global equity ETF", ai: 0.2, crypto: 0.2, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.95, supplyChain: 0.35 },
  "JEDI.L": { label: "Thematic ETF", ai: 0.45, crypto: 0.3, rates: -0.55, energy: -0.25, fx: -0.8, beta: 1.2, supplyChain: 0.4 },
  "ANX.PA": { label: "European equity", ai: 0.15, crypto: 0.18, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.9, supplyChain: 0.3 },
  "EX13.VI": { label: "European equity ETF", ai: 0.15, crypto: 0.18, rates: -0.35, energy: -0.2, fx: -0.85, beta: 0.9, supplyChain: 0.3 },
};

const FALLBACK: TickerShockProfile = {
  label: "Unclassified growth",
  ai: 0.35,
  crypto: 0.3,
  rates: -0.5,
  energy: -0.2,
  fx: -0.3,
  beta: 1.0,
  supplyChain: 0.3,
};

export function tickerBase(ticker: string): string {
  return ticker.split(".")[0]!.toUpperCase();
}

export function getShockProfile(ticker: string): TickerShockProfile {
  const raw = ticker.trim();
  const base = tickerBase(raw);
  const found =
    PROFILES[raw.toUpperCase()] ??
    PROFILES[raw] ??
    PROFILES[base];

  if (found) return found;

  // Dynamic heuristic fallback for non-canonical tickers
  const isEuropean = raw.includes(".");
  return {
    ...FALLBACK,
    label: isEuropean ? "International equity" : "Unclassified equity",
    fx: isEuropean ? -0.85 : -0.3,
  };
}

/** Fraction of the headline move applied to this ticker (0–1+). */
export function shockBeta(ticker: string, shock: ShockId): number {
  if (shock === "none") return 0;
  if (shock === "broad_down15") return 1;
  const p = getShockProfile(ticker);
  switch (shock) {
    case "ai_down20":
      return p.ai;
    case "btc_winter35":
      return p.crypto;
    case "rates_up":
      // rates factor is signed: map −1..0 onto 0..1 hurt intensity for headline
      return Math.max(0, -p.rates);
    case "tech_pullback10":
      return Math.max(0.1, (p.ai * 0.75 + Math.max(0, -p.rates) * 0.25) * (p.beta ?? 1.0));
    case "oil_shock25": {
      const e = p.energy ?? -0.2;
      return e > 0 ? e * 0.48 : Math.abs(e) * 0.2 * (p.beta ?? 1.0);
    }
    case "usd_surge7":
      return Math.abs(p.fx ?? -0.3);
    case "china_supply_shock":
      return p.supplyChain ?? (p.ai > 0.7 ? 0.8 : 0.2);
    case "soft_landing_rally": {
      const beta = p.beta ?? 1.0;
      return Math.max(0.3, beta * 0.6 + p.ai * 0.25 + p.crypto * 0.15);
    }
    default:
      return 0;
  }
}

export function shockedPct(ticker: string, shock: ShockId): number {
  if (shock === "none") return 0;
  const meta = SHOCKS.find((s) => s.id === shock);
  if (!meta) return 0;

  if (shock === "broad_down15") return meta.headlinePct;

  if (shock === "rates_up") {
    const p = getShockProfile(ticker);
    return meta.headlinePct * Math.max(0, -p.rates);
  }

  if (shock === "oil_shock25") {
    const p = getShockProfile(ticker);
    const energySens = p.energy ?? -0.2;
    if (energySens > 0) {
      // Energy & power rally
      return 0.12 * energySens;
    }
    // High energy input consumers & tech face margin drag
    return -0.05 * Math.max(0.2, -energySens) * (p.beta ?? 1.0);
  }

  if (shock === "tech_pullback10") {
    const p = getShockProfile(ticker);
    const factor = Math.max(0.1, (p.ai * 0.75 + Math.max(0, -p.rates) * 0.25) * (p.beta ?? 1.0));
    return meta.headlinePct * factor;
  }

  if (shock === "usd_surge7") {
    const p = getShockProfile(ticker);
    const fxSens = p.fx ?? (ticker.includes(".") ? -0.85 : -0.3);
    return -0.07 * Math.abs(fxSens);
  }

  if (shock === "china_supply_shock") {
    const p = getShockProfile(ticker);
    const scSens = p.supplyChain ?? (p.ai > 0.7 ? 0.8 : 0.2);
    return meta.headlinePct * scSens;
  }

  if (shock === "soft_landing_rally") {
    const p = getShockProfile(ticker);
    const beta = p.beta ?? 1.0;
    const factor = Math.max(0.3, beta * 0.6 + p.ai * 0.25 + p.crypto * 0.15);
    return meta.headlinePct * factor;
  }

  return meta.headlinePct * shockBeta(ticker, shock);
}

export function shockedPrice(
  ticker: string,
  spot: number,
  shock: ShockId
): number {
  if (!(spot > 0) || shock === "none") return spot;
  const pct = shockedPct(ticker, shock);
  return spot * (1 + pct);
}

export type ShockHoldingImpact = {
  ticker: string;
  label: string;
  shares: number;
  livePx: number;
  shockPx: number;
  liveVal: number;
  shockVal: number;
  deltaVal: number;
  deltaPct: number;
  movePct: number;
  lossSharePct: number;
};

export type ShockMarginAnalysis = {
  isUsingMargin: boolean;
  marginDebt: number;
  liveEquity: number;
  shockedEquity: number;
  liveLeverage: number;
  shockedLeverage: number;
  liveDebtToEquityPct: number;
  shockedDebtToEquityPct: number;
  maintenanceRate: number;
  liveMaintenanceReq: number;
  shockedMaintenanceReq: number;
  liveEquityCushion: number;
  shockedEquityCushion: number;
  shockedCushionPct: number;
  marginCallRisk: "safe" | "caution" | "critical";
  statusBlurb: string;
  liveCashPct: number;
  shockedCashPct: number;
};

export type PortfolioShockAnalysis = {
  shock: ShockId;
  scenario: ShockDefinition;
  liveHoldingsVal: number;
  shockedHoldingsVal: number;
  liveTotalVal: number;
  shockedTotalVal: number;
  deltaVal: number;
  deltaPct: number;
  cash: number;
  margin: ShockMarginAnalysis;
  rows: ShockHoldingImpact[];
  topVulnerability: ShockHoldingImpact | null;
  topShockAbsorber: ShockHoldingImpact | null;
  themeBreakdown: { theme: string; deltaVal: number; liveVal: number; pctOfLoss: number }[];
  tacticalNotes: string[];
};

/**
 * Computes end-to-end portfolio impact, leverage ratios, and margin cushion
 * under any selected macro shock scenario.
 */
export function analyzePortfolioShock(
  holdings: { ticker: string; shares: number; price: number }[],
  cash: number,
  shockId: ShockId
): PortfolioShockAnalysis {
  const scenario = SHOCKS.find((s) => s.id === shockId) ?? SHOCKS[0]!;

  const rows: ShockHoldingImpact[] = holdings
    .filter((h) => h.shares > 0 && h.price > 0)
    .map((h) => {
      const livePx = h.price;
      const shockPx = shockedPrice(h.ticker, livePx, shockId);
      const liveVal = h.shares * livePx;
      const shockVal = h.shares * shockPx;
      const deltaVal = shockVal - liveVal;
      const deltaPct = liveVal > 0 ? deltaVal / liveVal : 0;
      const movePct = shockedPct(h.ticker, shockId);
      const profile = getShockProfile(h.ticker);

      return {
        ticker: h.ticker,
        label: profile.label,
        shares: h.shares,
        livePx,
        shockPx,
        liveVal,
        shockVal,
        deltaVal,
        deltaPct,
        movePct,
        lossSharePct: 0,
      };
    })
    .sort((a, b) => a.deltaVal - b.deltaVal);

  const liveHoldingsVal = rows.reduce((s, r) => s + r.liveVal, 0);
  const shockedHoldingsVal = rows.reduce((s, r) => s + r.shockVal, 0);
  const liveTotalVal = liveHoldingsVal + cash;
  const shockedTotalVal = shockedHoldingsVal + cash;
  const deltaVal = shockedTotalVal - liveTotalVal;
  const deltaPct = liveTotalVal > 0 ? deltaVal / liveTotalVal : 0;

  // Calculate share of total dollar drop / gain
  if (Math.abs(deltaVal) > 0) {
    for (const r of rows) {
      r.lossSharePct = r.deltaVal / deltaVal;
    }
  }

  // Margin and leverage analysis
  const isUsingMargin = cash < -50;
  const marginDebt = isUsingMargin ? Math.abs(cash) : 0;
  const liveEquity = liveTotalVal;
  const shockedEquity = shockedTotalVal;

  const liveLeverage = liveEquity > 0 ? liveHoldingsVal / liveEquity : 1;
  const shockedLeverage = shockedEquity > 0 ? shockedHoldingsVal / shockedEquity : (marginDebt > 0 ? Infinity : 1);
  const liveDebtToEquityPct = liveEquity > 0 ? (marginDebt / liveEquity) * 100 : 0;
  const shockedDebtToEquityPct = shockedEquity > 0 ? (marginDebt / shockedEquity) * 100 : (marginDebt > 0 ? 999 : 0);

  const maintenanceRate = 0.30; // standard 30% maintenance margin
  const liveMaintenanceReq = liveHoldingsVal * maintenanceRate;
  const shockedMaintenanceReq = shockedHoldingsVal * maintenanceRate;
  const liveEquityCushion = liveEquity - liveMaintenanceReq;
  const shockedEquityCushion = shockedEquity - shockedMaintenanceReq;
  const shockedCushionPct = shockedEquity > 0 ? (shockedEquityCushion / shockedEquity) * 100 : -100;

  let marginCallRisk: "safe" | "caution" | "critical" = "safe";
  let statusBlurb = "Fully covered with positive liquidity.";

  if (isUsingMargin) {
    if (shockedEquityCushion <= 0) {
      marginCallRisk = "critical";
      statusBlurb = "Equity drops below broker 30% maintenance threshold. High probability of forced margin calls.";
    } else if (shockedCushionPct < 20) {
      marginCallRisk = "caution";
      statusBlurb = "Margin buffer drops below 20%. Leverage expands significantly in this scenario.";
    } else {
      marginCallRisk = "safe";
      statusBlurb = "Healthy equity buffer above maintenance requirements.";
    }
  } else if (cash > 0) {
    statusBlurb = `Cash provides full capital insulation. Dry powder expands from ${(liveTotalVal > 0 ? (cash / liveTotalVal) * 100 : 0).toFixed(1)}% to ${(shockedTotalVal > 0 ? (cash / shockedTotalVal) * 100 : 0).toFixed(1)}% of the book.`;
  }

  const liveCashPct = liveTotalVal > 0 ? (cash / liveTotalVal) * 100 : 0;
  const shockedCashPct = shockedTotalVal > 0 ? (cash / shockedTotalVal) * 100 : 0;

  const margin: ShockMarginAnalysis = {
    isUsingMargin,
    marginDebt,
    liveEquity,
    shockedEquity,
    liveLeverage,
    shockedLeverage,
    liveDebtToEquityPct,
    shockedDebtToEquityPct,
    maintenanceRate,
    liveMaintenanceReq,
    shockedMaintenanceReq,
    liveEquityCushion,
    shockedEquityCushion,
    shockedCushionPct,
    marginCallRisk,
    statusBlurb,
    liveCashPct,
    shockedCashPct,
  };

  // Top vulnerability and absorber
  const topVulnerability = rows.length > 0 && rows[0]!.deltaVal < 0 ? rows[0]! : null;
  const topShockAbsorber =
    rows.length > 0
      ? [...rows].sort((a, b) => b.deltaVal - a.deltaVal)[0] ?? null
      : null;

  // Theme loss aggregation
  const themeMap = new Map<string, { deltaVal: number; liveVal: number }>();
  for (const r of rows) {
    const existing = themeMap.get(r.label) ?? { deltaVal: 0, liveVal: 0 };
    existing.deltaVal += r.deltaVal;
    existing.liveVal += r.liveVal;
    themeMap.set(r.label, existing);
  }

  const themeBreakdown = [...themeMap.entries()]
    .map(([theme, data]) => ({
      theme,
      deltaVal: data.deltaVal,
      liveVal: data.liveVal,
      pctOfLoss: deltaVal !== 0 ? (data.deltaVal / deltaVal) * 100 : 0,
    }))
    .sort((a, b) => a.deltaVal - b.deltaVal);

  // Tactical observations (dash-free)
  const tacticalNotes: string[] = [];
  if (shockId !== "none") {
    tacticalNotes.push(scenario.tacticalAction);

    if (isUsingMargin) {
      if (marginCallRisk === "critical") {
        tacticalNotes.push("Margin debt warning: Portfolio equity breaches maintenance margin minimums.");
      } else if (marginCallRisk === "caution") {
        tacticalNotes.push(`Leverage expands from ${liveLeverage.toFixed(2)}x to ${shockedLeverage.toFixed(2)}x. Maintain debt discipline.`);
      } else {
        tacticalNotes.push(`Equity buffer stays comfortable with $${Math.max(0, Math.round(shockedEquityCushion)).toLocaleString()} in excess capital.`);
      }
    } else if (cash > 0) {
      tacticalNotes.push(`Cash buffers the drawdown. Dry powder grows to ${shockedCashPct.toFixed(1)}% of total account value.`);
    }

    if (topVulnerability && Math.abs(topVulnerability.lossSharePct) >= 0.35) {
      tacticalNotes.push(`${topVulnerability.ticker} represents ${(topVulnerability.lossSharePct * 100).toFixed(0)}% of the modeled drawdown.`);
    }
  }

  return {
    shock: shockId,
    scenario,
    liveHoldingsVal,
    shockedHoldingsVal,
    liveTotalVal,
    shockedTotalVal,
    deltaVal,
    deltaPct,
    cash,
    margin,
    rows,
    topVulnerability,
    topShockAbsorber,
    themeBreakdown,
    tacticalNotes,
  };
}
