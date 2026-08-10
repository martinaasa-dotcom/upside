/** Per-portfolio Show/Hide for CC + Forecast panels. */

export const CC_VISIBLE_KEY = "portfell-cc-visible-by-portfolio";
export const FORECAST_VISIBLE_KEY = "portfell-forecast-visible-by-portfolio";

export type VisibilityMap = Record<string, boolean>;

type PortfolioKey = { id: string; slug: string };

function canUseStorage() {
  return typeof window !== "undefined";
}

export function loadVisibilityMap(storageKey: string): VisibilityMap {
  if (!canUseStorage()) return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as VisibilityMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveVisibilityMap(storageKey: string, map: VisibilityMap) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Visible unless explicitly stored as false (checks slug then id). */
export function isPanelVisible(map: VisibilityMap, portfolio: PortfolioKey) {
  if (portfolio.slug && map[portfolio.slug] === false) return false;
  if (map[portfolio.id] === false) return false;
  return true;
}

/** Flip visibility and write under both slug and id so demo/supabase keys stay aligned. */
export function toggleVisibilityMap(
  map: VisibilityMap,
  portfolio: PortfolioKey
): VisibilityMap {
  const nextVisible = !isPanelVisible(map, portfolio);
  const next: VisibilityMap = { ...map, [portfolio.id]: nextVisible };
  if (portfolio.slug) next[portfolio.slug] = nextVisible;
  return next;
}
