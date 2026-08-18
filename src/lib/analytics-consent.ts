/** Device-level choice for Vercel Analytics and Speed Insights. */

export const ANALYTICS_CONSENT_KEY = "upside-analytics-consent-v1";
export const ANALYTICS_CONSENT_EVENT = "upside:analytics-consent";

export type AnalyticsConsent = "allow" | "deny";

export function loadAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
    return raw === "allow" || raw === "deny" ? raw : null;
  } catch {
    return null;
  }
}

export function saveAnalyticsConsent(value: AnalyticsConsent) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_KEY, value);
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_EVENT));
}
