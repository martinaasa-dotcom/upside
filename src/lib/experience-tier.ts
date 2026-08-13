/**
 * Self-reported experience tier — drives which tabs/panels default to
 * visible. Deliberately coarse (3 tiers, a handful of gates) rather than
 * per-feature toggles: the goal is "this looks simpler," not a settings
 * page with 30 checkboxes.
 */
import { LAB_TAB_ID, PULSE_TAB_ID, SEASONALITY_TAB_ID } from "@/lib/overview";

export type ExperienceTier = "novice" | "investor" | "advanced";

export const EXPERIENCE_TIERS: {
  id: ExperienceTier;
  label: string;
  blurb: string;
}[] = [
  {
    id: "novice",
    label: "New to investing",
    blurb: "Show me the essentials, I'll grow into the rest.",
  },
  {
    id: "investor",
    label: "Comfortable investor",
    blurb: "I understand stocks and portfolios, show me most things.",
  },
  {
    id: "advanced",
    label: "Very experienced",
    blurb: "I actively trade, use options, show me everything.",
  },
];

const STORAGE_KEY = "portfell-experience-tier";

export function loadStoredTier(): ExperienceTier | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "novice" || raw === "investor" || raw === "advanced" ? raw : null;
  } catch {
    return null;
  }
}

export function saveStoredTier(tier: ExperienceTier) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Meta-tab ids hidden per tier — must be the actual `__xxx__` tab id
 * constants from lib/overview (matches PortfolioTabs' MODES[i].id), not
 * plain labels. These were previously plain strings ("pulse", "lab", …)
 * that never matched, so novice-tier tab hiding silently did nothing.
 */
export const TIER_HIDDEN_META_TABS: Record<ExperienceTier, string[]> = {
  novice: [PULSE_TAB_ID, SEASONALITY_TAB_ID, LAB_TAB_ID],
  investor: [],
  advanced: [],
};

/** LabSheet group ids hidden per tier. */
export const TIER_HIDDEN_LAB_GROUPS: Record<ExperienceTier, string[]> = {
  novice: [],
  investor: ["advanced"],
  advanced: [],
};

const KNOWS_OPTIONS_STORAGE_KEY = "portfell-knows-options";

/**
 * Options familiarity — deliberately separate from ExperienceTier. A
 * "very experienced" investor who's never touched options should still
 * get every options surface removed, not just soft-defaulted-off; an
 * options-savvy novice-tier investor should still see them. Tri-state:
 * null = hasn't answered yet (show everything, same as today), true =
 * has some options familiarity, false = explicitly none.
 */
export function loadStoredKnowsOptions(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KNOWS_OPTIONS_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function saveStoredKnowsOptions(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KNOWS_OPTIONS_STORAGE_KEY, String(value));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Lab sub-tab ids hidden when the viewer has no options experience —
 * purely covered-call mechanics, unlike Cashflow (also tracks dividends,
 * still useful with zero premiums logged) which stays. */
export const NO_OPTIONS_HIDDEN_LAB_TABS = ["season"];
