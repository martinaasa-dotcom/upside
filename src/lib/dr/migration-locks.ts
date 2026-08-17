/**
 * Lint SQL migrations for statements that take ACCESS EXCLUSIVE locks
 * long enough to stall live traffic. Historical files are allowed to
 * have been written the old way; new files should follow the playbook
 * in docs/ZERO_DOWNTIME_MIGRATIONS.md.
 */

export type LockSeverity = "error" | "warn";

export type LockFinding = {
  severity: LockSeverity;
  line: number;
  rule: string;
  snippet: string;
  hint: string;
};

type Statement = {
  line: number;
  sql: string;
};

const DOLLAR_TAG = /\$([a-zA-Z_][a-zA-Z0-9_]*)?\$/g;

export function splitSqlStatements(src: string): Statement[] {
  const out: Statement[] = [];
  let buf = "";
  let startLine = 1;
  let line = 1;
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingle = false;
  let dollar: string | null = null;

  const push = () => {
    const sql = buf.trim();
    if (sql) out.push({ line: startLine, sql });
    buf = "";
  };

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "\n") line += 1;

    if (inLineComment) {
      buf += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      buf += ch;
      if (ch === "*" && next === "/") {
        buf += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      buf += ch;
      if (ch === "'" && next === "'") {
        buf += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (dollar) {
      buf += ch;
      if (src.startsWith(dollar, i)) {
        buf += dollar.slice(1);
        i += dollar.length;
        dollar = null;
        continue;
      }
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") {
      inLineComment = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlockComment = true;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      if (!buf.trim()) startLine = line;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "$") {
      DOLLAR_TAG.lastIndex = i;
      const m = DOLLAR_TAG.exec(src);
      if (m && m.index === i) {
        dollar = m[0];
        if (!buf.trim()) startLine = line;
        buf += dollar;
        i += dollar.length;
        continue;
      }
    }
    if (ch === ";") {
      buf += ch;
      push();
      startLine = line;
      i += 1;
      continue;
    }
    if (!buf.trim() && !/\s/.test(ch)) startLine = line;
    buf += ch;
    i += 1;
  }
  push();
  return out;
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tableFromCreate(sql: string): string | null {
  const m = sql.match(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:only\s+)?(?:public\.)?([a-z0-9_"]+)/i
  );
  return m ? m[1].replace(/"/g, "").toLowerCase() : null;
}

function tableFromIndex(sql: string): string | null {
  const m = sql.match(
    /on\s+(?:only\s+)?(?:public\.)?([a-z0-9_"]+)/i
  );
  return m ? m[1].replace(/"/g, "").toLowerCase() : null;
}

function snippet(sql: string): string {
  const one = stripComments(sql);
  return one.length > 140 ? `${one.slice(0, 137)}...` : one;
}

export function lintMigrationSql(src: string): LockFinding[] {
  const statements = splitSqlStatements(src);
  const created = new Set<string>();
  const findings: LockFinding[] = [];

  for (const stmt of statements) {
    const sql = stripComments(stmt.sql);
    if (!sql) continue;
    const createdTable = tableFromCreate(sql);
    if (createdTable) created.add(createdTable);

    const add = (
      severity: LockSeverity,
      rule: string,
      hint: string
    ) => {
      findings.push({
        severity,
        line: stmt.line,
        rule,
        snippet: snippet(stmt.sql),
        hint,
      });
    };

    if (/vacuum\s+full\b/i.test(sql)) {
      add(
        "error",
        "vacuum-full",
        "VACUUM FULL rewrites the table under an exclusive lock. Use pg_repack off-hours, or skip."
      );
    }
    if (/\breindex\b/i.test(sql) && !/concurrently/i.test(sql)) {
      add(
        "error",
        "reindex",
        "REINDEX locks the relation. Use REINDEX INDEX CONCURRENTLY (PG 12+)."
      );
    }
    if (/\btruncate\b/i.test(sql)) {
      add(
        "error",
        "truncate",
        "TRUNCATE takes ACCESS EXCLUSIVE. Prefer batched DELETE, or run in a maintenance window."
      );
    }
    if (
      /alter\s+table\b/i.test(sql) &&
      /alter\s+column\b/i.test(sql) &&
      /\btype\b/i.test(sql)
    ) {
      add(
        "error",
        "alter-column-type",
        "Changing a column type rewrites the table. Add a new column, backfill in batches, switch reads, then drop the old one."
      );
    }
    if (
      /alter\s+table\b/i.test(sql) &&
      /add\s+column\b/i.test(sql) &&
      /\bnot\s+null\b/i.test(sql) &&
      !/\bdefault\b/i.test(sql)
    ) {
      add(
        "error",
        "add-not-null",
        "ADD COLUMN NOT NULL without a default scans every row. Add nullable, backfill, then SET NOT NULL with a short lock_timeout."
      );
    }
    if (
      /create\s+(unique\s+)?index\b/i.test(sql) &&
      !/concurrently/i.test(sql)
    ) {
      const table = tableFromIndex(sql);
      if (table && !created.has(table)) {
        add(
          "error",
          "index-not-concurrent",
          "CREATE INDEX on an existing table locks writes. Use CREATE INDEX CONCURRENTLY (cannot run inside a transaction)."
        );
      }
    }
    if (
      /drop\s+index\b/i.test(sql) &&
      !/concurrently/i.test(sql) &&
      !/if\s+exists/i.test(sql)
    ) {
      add(
        "warn",
        "drop-index",
        "DROP INDEX locks the table. Prefer DROP INDEX CONCURRENTLY."
      );
    }
    if (
      /alter\s+table\b/i.test(sql) &&
      /add\s+(constraint\b|foreign\s+key\b|check\b)/i.test(sql) &&
      !/not\s+valid/i.test(sql) &&
      !/foreign\s+key/i.test(sql)
    ) {
      add(
        "warn",
        "validate-constraint",
        "New CHECK constraints scan the table. Add NOT VALID, then VALIDATE CONSTRAINT in a follow-up."
      );
    }
    if (
      /alter\s+table\b/i.test(sql) &&
      /add\s+constraint\b/i.test(sql) &&
      /foreign\s+key\b/i.test(sql) &&
      !/not\s+valid/i.test(sql)
    ) {
      add(
        "warn",
        "fk-not-valid",
        "ADD FOREIGN KEY scans the child table. Use NOT VALID then VALIDATE CONSTRAINT."
      );
    }
    if (/drop\s+column\b/i.test(sql)) {
      add(
        "warn",
        "drop-column",
        "Drop a column only after every running app build has stopped reading it (expand/contract)."
      );
    }
    if (/drop\s+table\b/i.test(sql)) {
      add(
        "warn",
        "drop-table",
        "DROP TABLE is exclusive. Confirm no live query still hits this name."
      );
    }
    if (
      /alter\s+table\b/i.test(sql) &&
      /rename\s+(column|to)\b/i.test(sql)
    ) {
      add(
        "warn",
        "rename",
        "Renames break in-flight queries. Add a new name, dual-write, then drop the old one."
      );
    }
  }
  return findings;
}

export function formatLockFindings(
  file: string,
  findings: LockFinding[]
): string {
  if (findings.length === 0) return `${file}: no lock hazards.`;
  return findings
    .map(
      (f) =>
        `${file}:${f.line} ${f.severity} ${f.rule}\n  ${f.snippet}\n  ${f.hint}`
    )
    .join("\n");
}

export function lockLintFailed(findings: LockFinding[]): boolean {
  return findings.some((f) => f.severity === "error");
}
