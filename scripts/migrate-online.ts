/**
 * Lint (and optionally apply) a SQL migration under short lock timeouts.
 *
 *   npx tsx scripts/migrate-online.ts --lint supabase/migrations/054_foo.sql
 *   npx tsx scripts/migrate-online.ts --apply supabase/migrations/054_foo.sql
 *
 * --apply needs DATABASE_URL and psql. CREATE INDEX CONCURRENTLY is run
 * outside a transaction. See docs/ZERO_DOWNTIME_MIGRATIONS.md.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  formatLockFindings,
  lintMigrationSql,
  lockLintFailed,
  splitSqlStatements,
} from "../src/lib/dr/migration-locks";
import { supabaseDatabaseUrl, isSupabasePoolerUrl } from "../src/lib/supabase/env";

const LOCK_TIMEOUT = process.env.DR_LOCK_TIMEOUT?.trim() || "2s";
const STATEMENT_TIMEOUT = process.env.DR_STATEMENT_TIMEOUT?.trim() || "30s";
const MAX_LOCK_RETRIES = Number(process.env.DR_LOCK_RETRIES ?? 8);

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function psql(databaseUrl: string, sql: string): void {
  const wrapped = `SET lock_timeout = '${LOCK_TIMEOUT}';
SET statement_timeout = '${STATEMENT_TIMEOUT}';
${sql}`;
  const result = spawnSync(
    "psql",
    [databaseUrl, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-c", wrapped],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  if (result.error) {
    throw new Error(`psql is not available (${result.error.message}).`);
  }
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "psql failed").trim());
  }
}

function isConcurrentIndex(sql: string): boolean {
  return /create\s+(unique\s+)?index\s+concurrently/i.test(sql);
}

function looksLikeLockTimeout(message: string): boolean {
  return /lock timeout|canceling statement due to lock timeout/i.test(message);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function applyWithRetry(databaseUrl: string, sql: string): Promise<void> {
  let last = "";
  for (let attempt = 1; attempt <= MAX_LOCK_RETRIES; attempt++) {
    try {
      psql(databaseUrl, sql);
      return;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
      if (!looksLikeLockTimeout(last) || attempt === MAX_LOCK_RETRIES) {
        throw err;
      }
      const wait = Math.min(1000 * 2 ** (attempt - 1), 15_000);
      console.error(
        `lock timeout on attempt ${attempt}/${MAX_LOCK_RETRIES}, retrying in ${wait}ms`
      );
      await sleep(wait);
    }
  }
  throw new Error(last);
}

async function main() {
  const lintPath = arg("--lint");
  const applyPath = arg("--apply");
  const file = applyPath || lintPath || process.argv[2];
  if (!file || file.startsWith("-")) {
    console.error(
      "Usage: npx tsx scripts/migrate-online.ts --lint <file.sql> [--apply <file.sql>]"
    );
    process.exit(2);
  }

  const src = readFileSync(file, "utf8");
  const findings = lintMigrationSql(src);
  console.log(formatLockFindings(file, findings));
  if (lockLintFailed(findings) && !hasFlag("--force")) {
    console.error(
      "Refusing to apply. Rewrite the lock hazards, or pass --force for a maintenance window."
    );
    process.exit(1);
  }

  if (!applyPath) return;

  const databaseUrl = arg("--database") || supabaseDatabaseUrl();
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for --apply.");
    process.exit(1);
  }
  if (isSupabasePoolerUrl(databaseUrl)) {
    console.error(
      "Use the direct DATABASE_URL (port 5432), not the transaction pooler. CREATE INDEX CONCURRENTLY and lock_timeout need a real session."
    );
    process.exit(1);
  }

  const statements = splitSqlStatements(src).filter((s) => {
    const body = s.sql
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/--[^\n]*/g, " ")
      .trim();
    return body.length > 0 && body !== ";";
  });

  for (const stmt of statements) {
    const sql = stmt.sql.trim();
    if (isConcurrentIndex(sql)) {
      console.error(`CONCURRENTLY (no transaction) @ line ${stmt.line}`);
      await applyWithRetry(databaseUrl, sql);
      continue;
    }
    console.error(`apply @ line ${stmt.line}`);
    await applyWithRetry(databaseUrl, sql);
  }
  console.log(`applied ${statements.length} statement(s) from ${file}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
