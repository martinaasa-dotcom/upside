import { describe, expect, it } from "vitest";

import { formatDateTime } from "@/lib/timezone";

// 2026-08-19, 20:45 and 00:30 UTC.
const EVENING = "2026-08-19T20:45:00.000Z";
const MIDNIGHT = "2026-08-19T00:30:00.000Z";

describe("formatDateTime", () => {
  it("prints a 24-hour clock even in a locale that prefers AM/PM", () => {
    const out = formatDateTime(
      EVENING,
      { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" },
      "en-US"
    );
    expect(out).toContain("20:45");
    expect(out).not.toMatch(/\b[AP]M\b/i);
  });

  it("renders midnight as 00, not 24", () => {
    const out = formatDateTime(
      MIDNIGHT,
      { timeZone: "UTC", hour: "2-digit", minute: "2-digit" },
      "en-US"
    );
    expect(out).toBe("00:30");
  });

  it("keeps the 24-hour clock for hour: numeric call sites", () => {
    const out = formatDateTime(
      MIDNIGHT,
      { timeZone: "UTC", hour: "numeric", minute: "2-digit" },
      "en-US"
    );
    expect(out).not.toMatch(/\b[AP]M\b/i);
  });

  it("accepts Date and epoch input", () => {
    const opts = { timeZone: "UTC", hour: "2-digit", minute: "2-digit" } as const;
    const fromDate = formatDateTime(new Date(EVENING), opts, "en-US");
    const fromEpoch = formatDateTime(Date.parse(EVENING), opts, "en-US");
    expect(fromDate).toBe("20:45");
    expect(fromEpoch).toBe("20:45");
  });

  it("returns an empty string for input that is not a real instant", () => {
    expect(formatDateTime("not a date")).toBe("");
    expect(formatDateTime(Number.NaN)).toBe("");
  });
});
