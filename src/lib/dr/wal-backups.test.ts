import { describe, expect, it } from "vitest";
import { evaluateWalBackups } from "./wal-backups";

describe("WAL backup verification", () => {
  const now = new Date("2026-08-17T12:00:00.000Z");

  it("passes a fresh WAL-G restore point", () => {
    const check = evaluateWalBackups(
      {
        walg_enabled: true,
        pitr_enabled: true,
        backups: [],
        physical_backup_data: {
          latest_physical_backup_date_unix: Math.floor(
            new Date("2026-08-17T10:00:00.000Z").getTime() / 1000
          ),
        },
      },
      { now, maxAgeHours: 36 }
    );
    expect(check.ok).toBe(true);
    expect(check.walgEnabled).toBe(true);
    expect(check.reason).toMatch(/WAL-G/);
  });

  it("fails when the latest backup is stale", () => {
    const check = evaluateWalBackups(
      {
        walg_enabled: false,
        pitr_enabled: false,
        backups: [
          {
            status: "COMPLETED",
            inserted_at: "2026-08-14T10:00:00.000Z",
            is_physical_backup: true,
          },
        ],
      },
      { now, maxAgeHours: 36 }
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/hours old/);
  });

  it("fails PITR without WAL-G", () => {
    const check = evaluateWalBackups(
      {
        walg_enabled: false,
        pitr_enabled: true,
        backups: [
          {
            status: "COMPLETED",
            inserted_at: "2026-08-17T10:00:00.000Z",
          },
        ],
      },
      { now, maxAgeHours: 36 }
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/WAL-G is not enabled/);
  });

  it("ignores incomplete daily rows", () => {
    const check = evaluateWalBackups(
      {
        backups: [{ status: "RUNNING", inserted_at: "2026-08-17T11:00:00.000Z" }],
      },
      { now, maxAgeHours: 36 }
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/no completed/);
  });
});
