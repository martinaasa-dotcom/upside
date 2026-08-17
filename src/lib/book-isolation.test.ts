import { describe, expect, it } from "vitest";
import { DEMO_PORTFOLIOS } from "@/lib/demo-store";
import {
  cacheIsFamilyDemoLeak,
  isLocalFamilyDemoSheet,
  LOCAL_FAMILY_DEMO_IDS,
  stripLocalFamilyDemoBook,
} from "@/lib/book-isolation";

describe("book isolation", () => {
  it("pins the family demo ids so a signed-in book cannot keep them", () => {
    expect([...LOCAL_FAMILY_DEMO_IDS].sort()).toEqual([
      "p-aasad",
      "p-anu",
      "p-karud",
      "p-maryann",
    ]);
    expect(DEMO_PORTFOLIOS.every((p) => isLocalFamilyDemoSheet(p))).toBe(true);
    expect(isLocalFamilyDemoSheet({ id: "d23a2edc-ae2b-47d4-81dc-7d5015e59a04" })).toBe(
      false
    );
  });

  it("treats a demo-source cache as a leak for a signed-in user", () => {
    expect(
      cacheIsFamilyDemoLeak({
        source: "demo",
        portfolios: [{ id: "my-own-sheet" }],
      })
    ).toBe(true);
    expect(
      cacheIsFamilyDemoLeak({
        source: "supabase",
        portfolios: [{ id: "p-maryann" }, { id: "my-portfolio" }],
      })
    ).toBe(true);
    expect(
      cacheIsFamilyDemoLeak({
        source: "supabase",
        portfolios: [{ id: "d23a2edc-ae2b-47d4-81dc-7d5015e59a04" }],
      })
    ).toBe(false);
  });

  it("strips family demo sheets and their holdings, keeps the user's sheet", () => {
    const { portfolios, holdings } = stripLocalFamilyDemoBook(
      [
        { id: "p-maryann", name: "MaryAnn" },
        { id: "p-karud", name: "Karud" },
        { id: "mine", name: "My portfolio" },
      ],
      [
        { id: "h1", portfolio_id: "p-maryann" },
        { id: "h2", portfolio_id: "p-karud" },
        { id: "h3", portfolio_id: "mine" },
      ]
    );
    expect(portfolios.map((p) => p.id)).toEqual(["mine"]);
    expect(holdings.map((h) => h.id)).toEqual(["h3"]);
  });
});
