import { describe, expect, it } from "vitest";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";
import { bookChecksum } from "./checksum";
import {
  buildRestoreSql,
  restoreInMemory,
  restoreSnapshot,
} from "./restore-schema";

const payload: BookSnapshotPayload = {
  portfolios: [
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cash_balance: 100.5 },
  ],
  holdings: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      portfolio_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      ticker: "VST",
      shares: 200,
      buy_price: 145,
    },
  ],
};

describe("restore validator", () => {
  it("matches SUM(cash)+SUM(holdings) in memory", () => {
    const report = restoreInMemory(payload, "dr_restore_test_aaa");
    expect(report.ok).toBe(true);
    expect(report.mode).toBe("memory");
    expect(report.restored.bookSum).toBe(100.5 + 200 * 145);
    expect(report.restored.bookSum).toBe(bookChecksum(payload).bookSum);
  });

  it("emits isolated schema SQL that never touches public", () => {
    const sql = buildRestoreSql("dr_restore_20260817t120000_abc", payload);
    expect(sql.setup).toMatch(/CREATE SCHEMA "dr_restore_20260817t120000_abc"/);
    expect(sql.setup).toMatch(/SET search_path TO "dr_restore_20260817t120000_abc"/);
    expect(sql.setup).not.toMatch(/public\./);
    expect(sql.measure).toMatch(/SUM\(cash_balance\)/);
    expect(sql.measure).toMatch(/shares \* buy_price/);
    expect(sql.teardown).toMatch(
      /DROP SCHEMA IF EXISTS "dr_restore_20260817t120000_abc" CASCADE/
    );
  });

  it("refuses a schema name that could escape the sandbox", () => {
    expect(() => buildRestoreSql("public", payload)).toThrow(/Refusing/);
    expect(() => buildRestoreSql("dr_restore_;drop", payload)).toThrow(
      /Refusing/
    );
  });

  it("require-sql without DATABASE_URL fails closed", () => {
    const report = restoreSnapshot(payload, { requireSql: true });
    expect(report.ok).toBe(false);
    expect(report.reason).toMatch(/DATABASE_URL/);
  });
});
