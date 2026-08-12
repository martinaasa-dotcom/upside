/**
 * CSV holdings import — lets anyone onboard a portfolio from a spreadsheet
 * export without needing a broker screenshot for Margus to read. Deliberately
 * dependency-free (no papaparse) since the shape is simple: a header row plus
 * ticker/shares/price columns, tolerant of common column-name variations.
 */
import { resolveImportTicker } from "@/lib/ticker";

export type CsvHoldingRow = {
  ticker: string;
  shares: number;
  buyPrice: number;
  callPct?: number;
};

export type CsvSkippedRow = {
  line: number;
  reason: string;
  raw: string;
};

export type CsvImportResult = {
  rows: CsvHoldingRow[];
  /** Cash balance in USD if a Cash column or CASH row was present. */
  cash: number | null;
  skipped: CsvSkippedRow[];
};

const CASH_KEYS = new Set(["CASH", "CASH BALANCE", "CASHBALANCE"]);

/** Minimal RFC4180-ish line splitter: handles quoted fields, embedded commas, "" escapes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";" || ch === "\t") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function normalizeHeaderCell(cell: string): string {
  return cell.trim().toLowerCase().replace(/[^a-z%]/g, "");
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeaderCell);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,€£\s]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const TICKER_ALIASES = ["ticker", "symbol", "stock", "asset", "name"];
const SHARES_ALIASES = ["shares", "quantity", "qty", "units", "amount"];
const BUY_PRICE_ALIASES = [
  "buyprice",
  "buy",
  "avgprice",
  "avgbuyprice",
  "averageprice",
  "averagecost",
  "costbasis",
  "cost",
  "price",
];
const CALL_PCT_ALIASES = ["callpct", "call%", "targetcallpct", "targetcall%"];
const CASH_COL_ALIASES = ["cash", "cashbalance"];

/**
 * Parse CSV text into holdings rows. Header row is required; column order
 * and exact naming are flexible (Ticker/Symbol, Shares/Quantity,
 * "Buy Price"/"Avg Cost"/"Cost Basis", optional "Call %", optional "Cash").
 * A row whose ticker is literally CASH is treated as a cash balance instead
 * of a holding, same convention as the screenshot-import path.
 */
export function parseHoldingsCsv(text: string): CsvImportResult {
  const lines = text
    .split(/\r\n|\n|\r/)
    .map((l) => l)
    .filter((l) => l.trim().length > 0);

  const result: CsvImportResult = { rows: [], cash: null, skipped: [] };
  if (lines.length === 0) return result;

  const header = parseCsvLine(lines[0]!);
  const tickerCol = findColumn(header, TICKER_ALIASES);
  const sharesCol = findColumn(header, SHARES_ALIASES);
  const buyCol = findColumn(header, BUY_PRICE_ALIASES);
  const callCol = findColumn(header, CALL_PCT_ALIASES);
  const cashCol = findColumn(header, CASH_COL_ALIASES);

  if (tickerCol === -1 || sharesCol === -1 || buyCol === -1) {
    result.skipped.push({
      line: 1,
      raw: lines[0]!,
      reason:
        "Couldn't find Ticker, Shares, and Buy Price columns in the header row",
    });
    return result;
  }

  const byTicker = new Map<string, CsvHoldingRow>();

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!;
    const cells = parseCsvLine(raw);
    const tickerRaw = (cells[tickerCol] ?? "").trim();
    if (!tickerRaw) continue;

    if (cashCol >= 0) {
      const cashHere = parseNumber(cells[cashCol]);
      if (cashHere != null) {
        result.cash = (result.cash ?? 0) + cashHere;
      }
    }

    if (CASH_KEYS.has(tickerRaw.toUpperCase())) {
      const amount = parseNumber(cells[buyCol]) ?? parseNumber(cells[sharesCol]);
      if (amount != null) result.cash = (result.cash ?? 0) + amount;
      continue;
    }

    const ticker = resolveImportTicker(tickerRaw);
    if (!ticker) {
      result.skipped.push({ line: i + 1, raw, reason: "Unrecognized ticker" });
      continue;
    }

    const shares = parseNumber(cells[sharesCol]);
    if (!(shares != null && shares > 0)) {
      result.skipped.push({
        line: i + 1,
        raw,
        reason: "Missing or invalid share count",
      });
      continue;
    }

    const buyPrice = parseNumber(cells[buyCol]);
    if (!(buyPrice != null && buyPrice > 0)) {
      result.skipped.push({
        line: i + 1,
        raw,
        reason: "Missing or invalid buy price",
      });
      continue;
    }

    const callRaw = callCol >= 0 ? parseNumber(cells[callCol]) : null;
    const callPct =
      callRaw != null && callRaw > 0
        ? callRaw > 1
          ? callRaw / 100
          : callRaw
        : undefined;

    byTicker.set(ticker, { ticker, shares, buyPrice, callPct });
  }

  result.rows = [...byTicker.values()];
  return result;
}

/** Downloadable starter template — matches the flexible column names above. */
export const HOLDINGS_CSV_TEMPLATE = `Ticker,Shares,Buy Price,Call %
AAPL,10,150.25,15
MSFT,5,310.10,12
CASH,,2500,
`;

export function downloadHoldingsCsvTemplate() {
  if (typeof window === "undefined") return;
  const blob = new Blob([HOLDINGS_CSV_TEMPLATE], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "upside-holdings-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
