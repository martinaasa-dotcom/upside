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

export function normalizeYahooTicker(raw: string): string {
  let t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return t;

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

export function tickerExchangeHint(ticker: string): string | null {
  const t = ticker.toUpperCase();
  if (t.endsWith(".L")) return "London (Yahoo · often GBX/GBP)";
  if (t.endsWith(".DE")) return "Xetra / Frankfurt";
  if (t.endsWith(".AS")) return "Amsterdam";
  if (t.endsWith(".PA")) return "Paris";
  return null;
}
