/** Book-wide shock scenarios applied to mark prices (display / Arena). */

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
}[] = [
  { id: "none", label: "No shock", tagline: "Live marks" },
  {
    id: "ai_down20",
    label: "AI −20%",
    tagline: "NBIS / CRWV / NVDA / AVGO / PLTR digester",
  },
  {
    id: "btc_winter35",
    label: "Crypto winter −35%",
    tagline: "BMNR / MSTR-style treasury names",
  },
  {
    id: "broad_down15",
    label: "Broad −15%",
    tagline: "Everything marks down",
  },
  {
    id: "rates_up",
    label: "Rates bite",
    tagline: "Growth −12%, utilities +4%",
  },
];

const AI = new Set([
  "NBIS",
  "CRWV",
  "NVDA",
  "AVGO",
  "PLTR",
  "NOW",
  "GOOGL",
  "TSM",
]);
const CRYPTO = new Set(["BMNR", "MSTR", "COIN", "MARA", "RIOT"]);
const DEFENSIVE = new Set(["VST", "PWR"]);

export function shockedPrice(
  ticker: string,
  spot: number,
  shock: ShockId
): number {
  if (!(spot > 0) || shock === "none") return spot;
  const base = ticker.split(".")[0]!.toUpperCase();
  switch (shock) {
    case "ai_down20":
      return AI.has(base) ? spot * 0.8 : spot;
    case "btc_winter35":
      return CRYPTO.has(base) ? spot * 0.65 : spot;
    case "broad_down15":
      return spot * 0.85;
    case "rates_up":
      if (DEFENSIVE.has(base)) return spot * 1.04;
      if (AI.has(base) || CRYPTO.has(base)) return spot * 0.88;
      return spot * 0.94;
    default:
      return spot;
  }
}
