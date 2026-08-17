import { DEMO_PORTFOLIOS } from "@/lib/demo-store";
import type { Holding, Portfolio } from "@/lib/types";

/** Local demo ids only. Live family sheets use UUIDs. */
export const LOCAL_FAMILY_DEMO_IDS = new Set(
  DEMO_PORTFOLIOS.map((p) => p.id)
);

export function isLocalFamilyDemoSheet(row: {
  id?: string | null;
}): boolean {
  return Boolean(row.id && LOCAL_FAMILY_DEMO_IDS.has(row.id));
}

export function cacheIsFamilyDemoLeak(cache: {
  source: string;
  portfolios: { id: string }[];
}): boolean {
  return (
    cache.source === "demo" ||
    cache.portfolios.some(isLocalFamilyDemoSheet)
  );
}

/** Drop Aasad / Anu / MaryAnn / Karud local demo rows from a signed-in book. */
export function stripLocalFamilyDemoBook<
  T extends { id: string },
  H extends { portfolio_id: string },
>(
  portfolios: T[],
  holdings: H[]
): { portfolios: T[]; holdings: H[] } {
  const nextPortfolios = portfolios.filter((p) => !isLocalFamilyDemoSheet(p));
  const keep = new Set(nextPortfolios.map((p) => p.id));
  return {
    portfolios: nextPortfolios,
    holdings: holdings.filter((h) => keep.has(h.portfolio_id)),
  };
}

export function ownSheetsOnly(
  portfolios: Portfolio[],
  holdings: Holding[]
): { portfolios: Portfolio[]; holdings: Holding[] } {
  return stripLocalFamilyDemoBook(portfolios, holdings);
}
