/**
 * Shock scenarios with per-ticker thematic betas.
 * Betas are 0–1 intensity vs the scenario’s headline move (not binary buckets).
 * Crypto winter includes risk-off spillover into high-beta AI / growth — not only BMNR.
 */

export type ShockId =
  | "none"
  | "ai_down20"
  | "btc_winter35"
  | "broad_down15"
  | "rates_up";

export const SHOCKS: {
  id: ShockId;
  label: string;
  tagline: string;
  /** Headline move applied at beta=1 */
  headlinePct: number;
}[] = [
  { id: "none", label: "No shock", tagline: "Live marks", headlinePct: 0 },
  {
    id: "ai_down20",
    label: "AI −20%",
    tagline:
      "GPU cloud, semis, AI software, and AI-power (VST/PWR) — sized by AI beta",
    headlinePct: -0.2,
  },
  {
    id: "btc_winter35",
    label: "Crypto winter −35%",
    tagline:
      "Crypto treasuries hardest; high-beta AI/growth & fintech follow on risk-off",
    headlinePct: -0.35,
  },
  {
    id: "broad_down15",
    label: "Broad −15%",
    tagline: "Uniform mark-down across the selected book",
    headlinePct: -0.15,
  },
  {
    id: "rates_up",
    label: "Rates bite",
    tagline: "Duration/growth sold; AI-power less hurt than pure speculative beta",
    headlinePct: -0.12,
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
};

/**
 * Canonical profiles for Upside book names + common adjacents.
 * Unknown tickers fall back to a mild growth beta.
 */
const PROFILES: Record<string, TickerShockProfile> = {
  // AI infra / neo-cloud
  NBIS: { label: "AI infra / GPU cloud", ai: 1, crypto: 0.5, rates: -1 },
  CRWV: { label: "AI infra / neo-cloud", ai: 1, crypto: 0.48, rates: -0.95 },
  // Semis / AI chips
  NVDA: { label: "Semis / AI chips", ai: 1, crypto: 0.38, rates: -0.9 },
  AVGO: { label: "Semis / AI interconnect", ai: 0.95, crypto: 0.32, rates: -0.85 },
  TSM: { label: "Semis / foundry", ai: 0.9, crypto: 0.3, rates: -0.8 },
  ASML: { label: "Semis / lithography", ai: 0.85, crypto: 0.28, rates: -0.75 },
  "ASML.AS": { label: "Semis / lithography", ai: 0.85, crypto: 0.28, rates: -0.75 },
  "SMH.L": { label: "Semis ETF", ai: 0.9, crypto: 0.3, rates: -0.8 },
  // AI software / platforms
  PLTR: { label: "AI software / data", ai: 0.9, crypto: 0.35, rates: -0.85 },
  NOW: { label: "Enterprise / AI software", ai: 0.75, crypto: 0.28, rates: -0.7 },
  GOOGL: { label: "Big tech / AI spend", ai: 0.55, crypto: 0.28, rates: -0.55 },
  "ABEA.DE": { label: "Big tech / AI spend", ai: 0.55, crypto: 0.28, rates: -0.55 },
  // AI power stack (data-center electricity + buildout — not classic defensive utilities)
  VST: { label: "AI power / generation", ai: 0.85, crypto: 0.3, rates: -0.25 },
  PWR: { label: "AI power / grid infra", ai: 0.8, crypto: 0.28, rates: -0.3 },
  // Crypto complex
  BMNR: { label: "Crypto / BTC treasury", ai: 0.2, crypto: 1, rates: -0.75 },
  MSTR: { label: "Crypto / BTC treasury", ai: 0.15, crypto: 1, rates: -0.8 },
  COIN: { label: "Crypto exchange", ai: 0.25, crypto: 0.95, rates: -0.7 },
  MARA: { label: "Crypto miner", ai: 0.15, crypto: 0.95, rates: -0.75 },
  RIOT: { label: "Crypto miner", ai: 0.15, crypto: 0.95, rates: -0.75 },
  // Speculative growth / space
  RKLB: { label: "Space / aerospace", ai: 0.2, crypto: 0.42, rates: -0.85 },
  // Fintech (crypto / risk appetite beta)
  HOOD: { label: "Fintech / brokerage", ai: 0.25, crypto: 0.55, rates: -0.65 },
  SOFI: { label: "Fintech / consumer", ai: 0.2, crypto: 0.4, rates: -0.6 },
  // Consumer internet
  RDDT: { label: "Consumer internet", ai: 0.3, crypto: 0.3, rates: -0.55 },
  // Indexes / broad
  SPY: { label: "US large-cap index", ai: 0.25, crypto: 0.22, rates: -0.4 },
  "CSPX.L": { label: "US large-cap index", ai: 0.25, crypto: 0.22, rates: -0.4 },
  "VWCE.DE": { label: "Global equity ETF", ai: 0.2, crypto: 0.2, rates: -0.35 },
  "JEDI.L": { label: "Thematic ETF", ai: 0.45, crypto: 0.3, rates: -0.55 },
  "ANX.PA": { label: "European equity", ai: 0.15, crypto: 0.18, rates: -0.35 },
  "EX13.VI": { label: "European equity ETF", ai: 0.15, crypto: 0.18, rates: -0.35 },
};

const FALLBACK: TickerShockProfile = {
  label: "Unclassified growth",
  ai: 0.35,
  crypto: 0.3,
  rates: -0.5,
};

export function tickerBase(ticker: string): string {
  return ticker.split(".")[0]!.toUpperCase();
}

export function getShockProfile(ticker: string): TickerShockProfile {
  const raw = ticker.trim();
  const base = tickerBase(raw);
  return (
    PROFILES[raw.toUpperCase()] ??
    PROFILES[raw] ??
    PROFILES[base] ??
    FALLBACK
  );
}

/** Fraction of the headline move applied to this ticker (0–1+). */
export function shockBeta(ticker: string, shock: ShockId): number {
  if (shock === "none" || shock === "broad_down15") return 1;
  const p = getShockProfile(ticker);
  switch (shock) {
    case "ai_down20":
      return p.ai;
    case "btc_winter35":
      return p.crypto;
    case "rates_up":
      // rates factor is signed: map −1..0 onto 0..1 hurt intensity for headline
      return Math.max(0, -p.rates);
    default:
      return 0;
  }
}

export function shockedPrice(
  ticker: string,
  spot: number,
  shock: ShockId
): number {
  if (!(spot > 0) || shock === "none") return spot;
  const meta = SHOCKS.find((s) => s.id === shock);
  if (!meta) return spot;

  if (shock === "broad_down15") {
    return spot * (1 + meta.headlinePct);
  }

  if (shock === "rates_up") {
    // rates profile: negative rates → apply headline hurt; near-zero → small move
    const p = getShockProfile(ticker);
    // p.rates −1 → −12%, p.rates 0 → 0, positive would rally (unused in book)
    const move = meta.headlinePct * Math.max(0, -p.rates);
    // Slight cushion for AI-power vs pure speculative (already in milder |rates|)
    return spot * (1 + move);
  }

  const beta = shockBeta(ticker, shock);
  return spot * (1 + meta.headlinePct * beta);
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
  return meta.headlinePct * shockBeta(ticker, shock);
}
