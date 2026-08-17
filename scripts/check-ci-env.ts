/**
 * CI env isolation: required NEXT_PUBLIC_* keys must be present and valid,
 * and secret names from .env.example must be unset so they cannot leak
 * into logs. Never prints values.
 */
import { readFileSync } from "node:fs";
import { validateServerEnv } from "../src/lib/env-schema";

const SECRET_KEY =
  /(_SECRET|_KEY|PASSWORD|TOKEN)$|^DATABASE_URL$|^DATABASE_POOLER_URL$/;

function parseExampleKeys(src: string): { publicRequired: string[]; secrets: string[] } {
  const publicRequired: string[] = [];
  const secrets: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    const m = line.match(/^#?\s*([A-Z][A-Z0-9_]+)=/);
    if (!m) continue;
    const key = m[1];
    const uncommented = !line.startsWith("#");
    if (key.startsWith("NEXT_PUBLIC_") && uncommented) {
      publicRequired.push(key);
    }
    if (!key.startsWith("NEXT_PUBLIC_") && SECRET_KEY.test(key)) {
      secrets.push(key);
    }
  }
  return {
    publicRequired: [...new Set(publicRequired)],
    secrets: [...new Set(secrets)],
  };
}

function main(): void {
  const example = readFileSync(".env.example", "utf8");
  const { publicRequired, secrets } = parseExampleKeys(example);

  const missing = publicRequired.filter((key) => !process.env[key]?.trim());
  const leaked = secrets.filter((key) => Boolean(process.env[key]?.trim()));
  const publicEnv: Record<string, string | undefined> = {};
  for (const key of publicRequired) publicEnv[key] = process.env[key];
  if (process.env.NEXT_PUBLIC_SITE_URL?.trim()) {
    publicEnv.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;
  }
  const malformed = validateServerEnv(publicEnv);

  if (missing.length) {
    console.error(`CI public env missing: ${missing.join(", ")}`);
  }
  if (leaked.length) {
    console.error(`CI must not receive secrets: ${leaked.join(", ")}`);
  }
  for (const issue of malformed) {
    console.error(`CI public env invalid: ${issue.key} (${issue.message})`);
  }

  if (missing.length || leaked.length || malformed.length) {
    process.exit(1);
  }
  console.log(`CI env isolation ok (${publicRequired.join(", ")})`);
}

main();
