import { describe, expect, it } from "vitest";
import { lintMigrationSql, lockLintFailed, splitSqlStatements } from "./migration-locks";

describe("zero-downtime migration lint", () => {
  it("allows indexes created with the new table", () => {
    const sql = `
      create table if not exists public.portfell_foo (
        id uuid primary key
      );
      create index if not exists portfell_foo_idx
        on public.portfell_foo (id);
    `;
    expect(lockLintFailed(lintMigrationSql(sql))).toBe(false);
  });

  it("rejects CREATE INDEX on an existing table without CONCURRENTLY", () => {
    const sql = `create index portfell_holdings_ticker_idx on public.portfell_holdings (ticker);`;
    const findings = lintMigrationSql(sql);
    expect(findings.some((f) => f.rule === "index-not-concurrent")).toBe(true);
    expect(lockLintFailed(findings)).toBe(true);
  });

  it("rejects ALTER COLUMN TYPE", () => {
    const sql = `alter table public.portfell_portfolios alter column name type varchar(200);`;
    expect(
      lintMigrationSql(sql).some((f) => f.rule === "alter-column-type")
    ).toBe(true);
  });

  it("splits dollar-quoted functions without breaking on inner semicolons", () => {
    const sql = `
      create or replace function public.portfell_ping()
      returns text
      language plpgsql
      as $$
      begin
        return 'ok';
      end;
      $$;
      comment on function public.portfell_ping() is 'ping';
    `;
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBe(2);
    expect(stmts[0].sql).toMatch(/language plpgsql/);
  });

  it("allows CREATE INDEX CONCURRENTLY", () => {
    const sql = `create index concurrently if not exists portfell_holdings_ticker_idx on public.portfell_holdings (ticker);`;
    expect(lockLintFailed(lintMigrationSql(sql))).toBe(false);
  });
});
