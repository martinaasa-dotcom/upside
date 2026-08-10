/** Per-portfolio Show/Hide for CC + Forecast panels. */

export const CC_VISIBLE_KEY = "portfell-cc-visible-by-portfolio";
export const FORECAST_VISIBLE_KEY = "portfell-forecast-visible-by-portfolio";

/** New sheets start with CC collapsed. */
export const CC_DEFAULT_VISIBLE = false;
/** New sheets keep Forecast open. */
export const FORECAST_DEFAULT_VISIBLE = true;

export type VisibilityMap = Record<string, boolean>;

type PortfolioKey = { id: string; slug?: string | null };

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

function storedFlag(
  map: VisibilityMap,
  portfolio: PortfolioKey
): boolean | undefined {
  if (portfolio.slug && portfolio.slug in map) return map[portfolio.slug];
  if (portfolio.id in map) return map[portfolio.id];
  return undefined;
}

/** Uses stored true/false when present; otherwise `defaultVisible`. */
export function isPanelVisible(
  map: VisibilityMap,
  portfolio: PortfolioKey,
  defaultVisible = true
) {
  const stored = storedFlag(map, portfolio);
  return stored === undefined ? defaultVisible : stored;
}

export function setPanelVisible(
  map: VisibilityMap,
  portfolio: PortfolioKey,
  visible: boolean
): VisibilityMap {
  const next: VisibilityMap = { ...map, [portfolio.id]: visible };
  if (portfolio.slug) next[portfolio.slug] = visible;
  return next;
}

/** Flip visibility and write under both slug and id so demo/supabase keys stay aligned. */
export function toggleVisibilityMap(
  map: VisibilityMap,
  portfolio: PortfolioKey,
  defaultVisible = true
): VisibilityMap {
  const nextVisible = !isPanelVisible(map, portfolio, defaultVisible);
  return setPanelVisible(map, portfolio, nextVisible);
}
