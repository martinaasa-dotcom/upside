/** RFC 4180 cell. Objects become JSON so a dump stays round-trippable. */
export function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      cols.push(key);
    }
  }
  const header = cols.map(csvEscape).join(",");
  const body = rows
    .map((row) => cols.map((col) => csvEscape(row[col])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

export function csvSection(
  title: string,
  rows: Array<Record<string, unknown>>
): string {
  const table = rowsToCsv(rows);
  return table ? `# ${title}\n${table}` : `# ${title}\n`;
}
