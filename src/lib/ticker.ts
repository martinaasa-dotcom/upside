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

/** Common Lightyear / Trade Republic / Xetra codes → Yahoo.
 * Bare names not listed here still get .DE / .L / .AS at quote time. */
const BROKER_BARE_TO_YAHOO: Record<string, string> = {
  RHM: "RHM.DE",
  HAG: "HAG.DE",
  VEUR: "VEUR.DE",
  VUAA: "VUAA.DE",
  "2B7K": "2B7K.DE",
  VWCE: "VWCE.DE",
  VWCG: "VWCG.DE",
  IWDA: "IWDA.AS",
  SXR8: "SXR8.DE",
  SPY5: "SPY5.DE",
  SPYL: "SPYL.DE",
  SPY4: "SPY4.DE",
  EUNL: "EUNL.DE",
  EXS1: "EXS1.DE",
  EXW1: "EXW1.DE",
  EXXT: "EXXT.DE",
  IUSQ: "IUSQ.DE",
  IUSN: "IUSN.DE",
  IUS3: "IUS3.DE",
  IS3N: "IS3N.DE",
  IS3R: "IS3R.DE",
  XDWD: "XDWD.DE",
  XD9U: "XD9U.DE",
  SPPW: "SPPW.DE",
  SXRV: "SXRV.DE",
  QDVE: "QDVE.DE",
  QDV5: "QDV5.DE",
  IQQH: "IQQH.DE",
  EUN2: "EUN2.DE",
  CSPX: "CSPX.L",
  VUSA: "VUSA.L",
};

/** Listings to try when a bare ticker is not a US name. Xetra first. */
export const EU_QUOTE_SUFFIXES = [".DE", ".L", ".AS"] as const;

/** Yahoo symbols to try for one typed ticker, Xetra before London. */
export function yahooQuoteCandidates(raw: string): string[] {
  const normalized = normalizeYahooTicker(raw);
  if (!normalized) return [];
  if (normalized.includes(".")) return [normalized];
  const out = [normalized];
  for (const suffix of EU_QUOTE_SUFFIXES) {
    const next = `${normalized}${suffix}`;
    if (!out.includes(next)) out.push(next);
  }
  return out;
}

export function normalizeYahooTicker(raw: string): string {
  let t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return t;
  // Broker UI often prefixes €RHM / $GOOGL. Strip every leading mark so
  // $€VUAA does not stay as €VUAA and miss the quote.
  t = t.replace(/^[€$£]+/, "");

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

  // Lightyear and other EU brokers show VUAA / VWCE bare. Yahoo needs the
  // exchange suffix or the quote call comes back empty.
  if (BROKER_BARE_TO_YAHOO[t]) return BROKER_BARE_TO_YAHOO[t];

  return t;
}

/** Strip a known exchange suffix so VUAA matches VUAA.DE in search. */
export function tickerStem(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  const dot = t.lastIndexOf(".");
  if (dot > 0 && KNOWN_SUFFIXES.has(t.slice(dot))) return t.slice(0, dot);
  return t;
}

/** After normalize: Yahoo-style symbols only, no HTML or free text. */
export function isPlausibleTicker(ticker: string): boolean {
  return /^[A-Z0-9^=.][A-Z0-9.\-=]{0,23}$/.test(ticker);
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
