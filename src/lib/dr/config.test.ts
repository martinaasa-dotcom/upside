import { describe, expect, it } from "vitest";
import { readDrConfig } from "./config";

/**
 * The cold-copy retention window is a privacy promise, not just an
 * operational knob: `src/app/privacy/page.tsx` §7 tells people a deleted
 * account can survive in a backup for at most this long. Pin the default
 * so it can't drift away from the published number without a failing test.
 */
describe("disaster-recovery config", () => {
  it("defaults cold retention to 30 days, matching the privacy policy", () => {
    expect(readDrConfig({}).coldRetentionDays).toBe(30);
  });

  it("lets an operator widen or narrow the window", () => {
    expect(readDrConfig({ DR_COLD_RETENTION_DAYS: "7" }).coldRetentionDays).toBe(7);
    expect(readDrConfig({ DR_COLD_RETENTION_DAYS: "90" }).coldRetentionDays).toBe(90);
  });

  it("ignores junk and falls back to the default rather than never purging", () => {
    // A zero or a negative would mean "delete everything" or "delete
    // nothing" depending on how it's read. Neither is a safe reading of a
    // typo, so both fall back.
    for (const bad of ["", "0", "-5", "abc", undefined]) {
      expect(
        readDrConfig({ DR_COLD_RETENTION_DAYS: bad }).coldRetentionDays
      ).toBe(30);
    }
  });

  it("defaults the backup staleness check to 36 hours", () => {
    expect(readDrConfig({}).backupMaxAgeHours).toBe(36);
  });

  it("has no cold storage configured until bucket and keys are all present", () => {
    expect(readDrConfig({}).cold).toBe(null);
    expect(
      readDrConfig({ DR_S3_BUCKET: "b", DR_S3_ACCESS_KEY_ID: "k" }).cold
    ).toBe(null);
    expect(
      readDrConfig({
        DR_S3_BUCKET: "b",
        DR_S3_ACCESS_KEY_ID: "k",
        DR_S3_SECRET_ACCESS_KEY: "s",
      })?.cold?.bucket
    ).toBe("b");
  });
});
