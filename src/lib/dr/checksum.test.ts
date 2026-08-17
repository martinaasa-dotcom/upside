import { describe, expect, it } from "vitest";
import {
  bookChecksum,
  checksumsMatch,
} from "./checksum";
import type { BookSnapshotPayload } from "@/lib/book-snapshot";

function payload(): BookSnapshotPayload {
  return {
    portfolios: [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", cash_balance: -7000 },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", cash_balance: 12.345 },
    ],
    holdings: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        portfolio_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ticker: "NBIS",
        shares: 500,
        buy_price: 109.96,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        portfolio_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        ticker: "CRWV",
        shares: 1100,
        buy_price: 83.27,
      },
    ],
  };
}

describe("bookChecksum", () => {
  it("is SUM(cash) + SUM(shares * buy price) to the cent", () => {
    const c = bookChecksum(payload());
    expect(c.portfolioCount).toBe(2);
    expect(c.holdingCount).toBe(2);
    expect(c.cashSum).toBe(-6987.65);
    expect(c.holdingsCostSum).toBe(500 * 109.96 + 1100 * 83.27);
    expect(c.bookSum).toBe(c.cashSum + c.holdingsCostSum);
    expect(c.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores live quotes on the payload", () => {
    const base = payload();
    const withMarks: BookSnapshotPayload = {
      ...base,
      marks: {
        capturedAt: "2026-08-17T00:00:00.000Z",
        quotes: { NBIS: 200 },
        navByPortfolio: { "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": 1 },
      },
    };
    expect(bookChecksum(base).sha256).toBe(bookChecksum(withMarks).sha256);
  });

  it("detects a drifted holding", () => {
    const a = bookChecksum(payload());
    const drifted = payload();
    (drifted.holdings[0] as { shares: number }).shares = 501;
    expect(checksumsMatch(a, bookChecksum(drifted))).toBe(false);
  });
});
