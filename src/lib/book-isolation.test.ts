import { describe, expect, it } from "vitest";
import {
  isLiveSheetId,
  isUnsignedLocalCache,
  keepLiveSheetsOnly,
} from "@/lib/book-isolation";

describe("book isolation", () => {
  it("treats postgres UUIDs as live sheets and local seed ids as not", () => {
    expect(isLiveSheetId("d23a2edc-ae2b-47d4-81dc-7d5015e59a04")).toBe(true);
    expect(isLiveSheetId("p-maryann")).toBe(false);
    expect(isLiveSheetId("p-karud")).toBe(false);
    expect(isLiveSheetId("")).toBe(false);
  });

  it("rejects an unsigned local cache for a signed-in session", () => {
    expect(isUnsignedLocalCache({ source: "demo" })).toBe(true);
    expect(isUnsignedLocalCache({ source: "supabase" })).toBe(false);
  });

  it("keeps only live sheets, drops local seed rows mixed into a signed-in book", () => {
    const { portfolios, holdings } = keepLiveSheetsOnly(
      [
        { id: "p-maryann", name: "MaryAnn" },
        { id: "p-karud", name: "Karud" },
        { id: "6b1a34c4-eeca-406b-aefe-79388cd9a335", name: "MaryAnn" },
        { id: "d23a2edc-ae2b-47d4-81dc-7d5015e59a04", name: "My portfolio" },
      ],
      [
        { id: "h1", portfolio_id: "p-maryann" },
        { id: "h2", portfolio_id: "p-karud" },
        { id: "h3", portfolio_id: "6b1a34c4-eeca-406b-aefe-79388cd9a335" },
        { id: "h4", portfolio_id: "d23a2edc-ae2b-47d4-81dc-7d5015e59a04" },
      ]
    );
    expect(portfolios.map((p) => p.id)).toEqual([
      "6b1a34c4-eeca-406b-aefe-79388cd9a335",
      "d23a2edc-ae2b-47d4-81dc-7d5015e59a04",
    ]);
    expect(holdings.map((h) => h.id)).toEqual(["h3", "h4"]);
  });
});
