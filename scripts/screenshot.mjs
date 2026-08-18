#!/usr/bin/env node
// Ad-hoc authenticated screenshot helper for verifying UI changes.
//
// Usage:
//   node scripts/screenshot.mjs <url> [outPath]
//
// Auth: provide a saved Playwright storageState so the browser starts
// already signed in (Google SSO can't be automated headlessly). Supply it
// as either:
//   - AUTH_STORAGE_STATE_JSON: the storageState JSON itself, inline
//   - AUTH_STORAGE_STATE_PATH: a path to a storageState.json file
// Capture one by signing into the app in a real browser and exporting
// cookies/localStorage via `npx playwright open --save-storage=state.json <url>`,
// then store its contents as an environment variable in the Claude Code
// environment settings (not in the repo, not in git).

import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

const [, , url, outPath = "screenshot.png"] = process.argv;

if (!url) {
  console.error("Usage: node scripts/screenshot.mjs <url> [outPath]");
  process.exit(1);
}

function loadStorageState() {
  const inline = process.env.AUTH_STORAGE_STATE_JSON;
  if (inline) return JSON.parse(inline);
  const path = process.env.AUTH_STORAGE_STATE_PATH;
  if (path && existsSync(path)) return JSON.parse(readFileSync(path, "utf8"));
  return undefined;
}

const storageState = loadStorageState();
if (!storageState) {
  console.warn(
    "No AUTH_STORAGE_STATE_JSON / AUTH_STORAGE_STATE_PATH set — screenshot will be taken signed out."
  );
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/opt/pw-browsers/chromium",
});
const context = await browser.newContext({
  viewport: { width: 480, height: 900 },
  ...(storageState ? { storageState } : {}),
});
const page = await context.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.screenshot({ path: outPath, fullPage: true });
await browser.close();
console.log(`Saved ${outPath}`);
