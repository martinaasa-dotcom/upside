import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";
import {
  BOOK_SUM_SQL,
  bookChecksum,
  bookChecksumFromRows,
  checksumsMatch,
  holdingCostRows,
  portfolioCashRows,
  type BookChecksum,
} from "@/lib/dr/checksum";
import { roundMoney } from "@/lib/money";

export type RestoreMode = "memory" | "postgres";

export type RestoreReport = {
  ok: boolean;
  mode: RestoreMode;
  schema: string;
  expected: BookChecksum;
  restored: BookChecksum;
  reason: string;
};

const SCHEMA_RE = /^dr_restore_[a-z0-9_]+$/;

export function newRestoreSchemaName(at = new Date()): string {
  const stamp = at
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14)
    .toLowerCase();
  const nonce = randomBytes(3).toString("hex");
  return `dr_restore_${stamp}_${nonce}`;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlNum(n: number, digits: number): string {
  if (!Number.isFinite(n)) throw new Error("non-finite number in snapshot");
  return roundMoney(n, digits).toFixed(digits);
}

function sqlId(id: string): string {
  const t = id.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return `${sqlLiteral(t)}::uuid`;
  }
  return sqlLiteral(t);
}

export function buildRestoreSql(
  schema: string,
  payload: BookSnapshotPayload
): { setup: string; measure: string; teardown: string } {
  if (!SCHEMA_RE.test(schema)) {
    throw new Error(`Refusing schema name ${schema}`);
  }
  const cash = portfolioCashRows(payload.portfolios);
  const holdings = holdingCostRows(payload.holdings);
  const ident = `"${schema}"`;
  const portValues = cash
    .map(
      (p) =>
        `(${sqlId(p.id)}, ${sqlNum(p.cash_balance, 2)}::numeric(14,2))`
    )
    .join(",\n");
  const holdValues = holdings
    .map((h) => {
      return `(${sqlId(h.id)}, ${sqlId(h.portfolio_id)}, ${sqlLiteral(h.ticker)}, ${sqlNum(h.shares, 4)}::numeric(14,4), ${sqlNum(h.buy_price, 4)}::numeric(14,4))`;
    })
    .join(",\n");

  const setup = [
    `CREATE SCHEMA ${ident};`,
    `SET search_path TO ${ident};`,
    `CREATE TABLE portfolios (
  id text PRIMARY KEY,
  cash_balance numeric(14,2) NOT NULL
);`,
    `CREATE TABLE holdings (
  id text PRIMARY KEY,
  portfolio_id text NOT NULL,
  ticker text NOT NULL,
  shares numeric(14,4) NOT NULL,
  buy_price numeric(14,4) NOT NULL
);`,
    cash.length
      ? `INSERT INTO portfolios (id, cash_balance) VALUES\n${portValues};`
      : "",
    holdings.length
      ? `INSERT INTO holdings (id, portfolio_id, ticker, shares, buy_price) VALUES\n${holdValues};`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const measure = `SET search_path TO ${ident};
SELECT ${BOOK_SUM_SQL} AS book_sum,
       COALESCE((SELECT SUM(cash_balance) FROM portfolios), 0) AS cash_sum,
       COALESCE((SELECT SUM(ROUND((shares * buy_price)::numeric, 2)) FROM holdings), 0) AS holdings_cost_sum,
       (SELECT COUNT(*) FROM portfolios) AS portfolio_count,
       (SELECT COUNT(*) FROM holdings) AS holding_count;`;

  const teardown = `DROP SCHEMA IF EXISTS ${ident} CASCADE;`;
  return { setup, measure, teardown };
}

export function restoreInMemory(
  payload: BookSnapshotPayload,
  schema = newRestoreSchemaName()
): RestoreReport {
  const expected = bookChecksum(payload);
  const restored = bookChecksumFromRows(
    portfolioCashRows(payload.portfolios),
    holdingCostRows(payload.holdings)
  );
  const ok = checksumsMatch(expected, restored);
  return {
    ok,
    mode: "memory",
    schema,
    expected,
    restored,
    reason: ok
      ? `In-memory restore matches. SUM(cash)+SUM(holdings)=${restored.bookSum}.`
      : `In-memory restore drifted. expected ${expected.bookSum}, got ${restored.bookSum}.`,
  };
}

function runPsql(databaseUrl: string, sql: string): string {
  const result = spawnSync(
    "psql",
    [
      databaseUrl,
      "-v",
      "ON_ERROR_STOP=1",
      "-X",
      "-q",
      "-t",
      "-A",
      "-F",
      "\t",
      "-c",
      sql,
    ],
    {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    }
  );
  if (result.error) {
    throw new Error(
      `psql is not available (${result.error.message}). Install Postgres client tools, or run without --require-sql.`
    );
  }
  if (result.status !== 0) {
    throw new Error(
      (result.stderr || result.stdout || `psql exited ${result.status}`).trim()
    );
  }
  return (result.stdout ?? "").trim();
}

export function restoreInPostgres(
  payload: BookSnapshotPayload,
  databaseUrl: string,
  schema = newRestoreSchemaName()
): RestoreReport {
  const expected = bookChecksum(payload);
  const { setup, measure, teardown } = buildRestoreSql(schema, payload);
  try {
    runPsql(databaseUrl, setup);
    const row = runPsql(databaseUrl, measure);
    const [bookSum, cashSum, holdingsCostSum, portfolioCount, holdingCount] =
      row.split("\t");
    const restored: BookChecksum = {
      cashSum: roundMoney(Number(cashSum)),
      holdingsCostSum: roundMoney(Number(holdingsCostSum)),
      bookSum: roundMoney(Number(bookSum)),
      portfolioCount: Number(portfolioCount),
      holdingCount: Number(holdingCount),
      sha256: expected.sha256,
    };
    const sumsMatch =
      restored.cashSum === expected.cashSum &&
      restored.holdingsCostSum === expected.holdingsCostSum &&
      restored.bookSum === expected.bookSum &&
      restored.portfolioCount === expected.portfolioCount &&
      restored.holdingCount === expected.holdingCount;
    return {
      ok: sumsMatch,
      mode: "postgres",
      schema,
      expected,
      restored,
      reason: sumsMatch
        ? `Postgres schema ${schema} matches. SUM(cash)+SUM(holdings)=${restored.bookSum}.`
        : `Postgres restore drifted. expected ${expected.bookSum}, got ${restored.bookSum}.`,
    };
  } finally {
    try {
      runPsql(databaseUrl, teardown);
    } catch {
      // Schema drop is best-effort so a failed insert still cleans up.
    }
  }
}

export function restoreSnapshot(
  payload: BookSnapshotPayload,
  opts?: { databaseUrl?: string; requireSql?: boolean }
): RestoreReport {
  const url = opts?.databaseUrl?.trim();
  if (url) return restoreInPostgres(payload, url);
  const memory = restoreInMemory(payload);
  if (opts?.requireSql) {
    return {
      ...memory,
      ok: false,
      reason:
        "DATABASE_URL is required for --require-sql. In-memory check passed, but Postgres restore did not run.",
    };
  }
  return memory;
}
