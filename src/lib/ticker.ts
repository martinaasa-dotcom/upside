/**
 * Normalize human/exchange tickers to Yahoo Finance symbols.
 * Keep US tickers bare; attach exchange suffixes for EU listings.
 *
 * Examples: LON:VOD → VOD.L · XETRA:VWCE → VWCE.DE · SAP.DE unchanged
 */
const PREFIX_TO_SUFFIX: Record<string, string> = {
  LON: ".L",
  LSE: ".L",
  XLON: ".L",
  XETRA: ".DE",
  ETR: ".DE",
  GER: ".DE",
  FRA: ".DE",
  XETR: ".DE",
  AMS: ".AS",
  AS: ".AS",
  PAR: ".PA",
  EPA: ".PA",
  BRU: ".BR",
  SWX: ".SW",
  VIE: ".VI",
  MIL: ".MI",
  MCE: ".MC",
  STO: ".ST",
  CPH: ".CO",
  HEL: ".HE",
  OSL: ".OL",
  TYO: ".T",
  TSE: ".T",
  HKG: ".HK",
};

const KNOWN_SUFFIXES = new Set([
  ".L",
  ".DE",
  ".AS",
  ".PA",
  ".BR",
  ".SW",
  ".VI",
  ".MI",
  ".MC",
  ".ST",
  ".CO",
  ".HE",
  ".OL",
  ".T",
  ".HK",
]);

/** Common Lightyear / EU-broker symbols → Yahoo */
const BROKER_BARE_TO_YAHOO: Record<string, string> = {
  RHM: "RHM.DE",
  HAG: "HAG.DE",
  VEUR: "VEUR.DE",
  VUAA: "VUAA.DE",
  "2B7K": "2B7K.DE",
  VWCE: "VWCE.DE",
  IWDA: "IWDA.AS",
  SXR8: "SXR8.DE",
  CSPX: "CSPX.L",
};

export function normalizeYahooTicker(raw: string): string {
  let t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return t;
  // Broker UI often prefixes €RHM / $GOOGL
  t = t.replace(/^[€$£]/, "");

  // LON:VOD / XETRA:SAP
  const prefixed = t.match(/^([A-Z]{2,5})[:\-/]([A-Z0-9.\-]+)$/);
  if (prefixed) {
    const [, exch, sym] = prefixed;
    const suffix = PREFIX_TO_SUFFIX[exch];
    if (suffix) {
      const base = sym.replace(/\.[A-Z]+$/, "");
      return `${base}${suffix}`;
    }
  }

  // Already Yahoo-style with suffix
  const dot = t.lastIndexOf(".");
  if (dot > 0) {
    const suffix = t.slice(dot);
    if (KNOWN_SUFFIXES.has(suffix)) return t;
  }

  return t;
}

/**
 * Resolve a broker screenshot ticker (+ optional ISIN) to a Yahoo symbol.
 * Prefer explicit exchange suffixes; else map known EU names; else ISIN country.
 */
export function resolveImportTicker(raw: string, isin?: string | null): string {
  const base = normalizeYahooTicker(raw);
  if (!base) return base;
  if (base.includes(".")) return base;
  if (BROKER_BARE_TO_YAHOO[base]) return BROKER_BARE_TO_YAHOO[base];

  const code = (isin ?? "").trim().toUpperCase();
  if (code.startsWith("US") || code.startsWith("KY")) return base;
  if (code.startsWith("DE") || code.startsWith("IE") || code.startsWith("NL")) {
    return `${base}.DE`;
  }
  if (code.startsWith("GB") || code.startsWith("JE")) return `${base}.L`;
  if (code.startsWith("FR")) return `${base}.PA`;
  return base;
}

export function tickerExchangeHint(ticker: string): string | null {
  const t = ticker.toUpperCase();
  if (t.endsWith(".L")) return "London (Yahoo · often GBX/GBP)";
  if (t.endsWith(".DE")) return "Xetra / Frankfurt";
  if (t.endsWith(".AS")) return "Amsterdam";
  if (t.endsWith(".PA")) return "Paris";
  return null;
}
