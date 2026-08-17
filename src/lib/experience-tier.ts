/**
 * Self-reported experience tier — drives which tabs/panels default to
 * visible. Deliberately coarse (3 tiers, a handful of gates) rather than
 * per-feature toggles: the goal is "this looks simpler," not a settings
 * page with 30 checkboxes.
 */
import { LAB_TAB_ID } from "@/lib/overview";

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
    blurb: "I actively trade, show me everything.",
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

export const EXPERIENCE_TIER_EVENT = "upside:experience-tier";

function emitExperienceChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EXPERIENCE_TIER_EVENT));
}

export function saveStoredTier(tier: ExperienceTier) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, tier);
  } catch {
    /* ignore quota / private mode */
  }
  emitExperienceChanged();
}

/**
 * Meta-tab ids hidden per tier — must be the actual `__xxx__` tab id
 * constants from lib/overview (matches PortfolioTabs' MODES[i].id), not
 * plain labels. These were previously plain strings ("pulse", "lab", …)
 * that never matched, so novice-tier tab hiding silently did nothing.
 *
 * Pulse is deliberately absent, so every tier sees it: "is my thesis
 * still intact after that move" is the question a newer investor most
 * needs answered, and it's the reason Pulse sits in the main tab row
 * rather than buried in Lab. Seasonality is a Lab sub-tab, so hiding Lab
 * for a novice hides it too.
 */
export const TIER_HIDDEN_META_TABS: Record<ExperienceTier, string[]> = {
  novice: [LAB_TAB_ID],
  investor: [],
  advanced: [],
};

/**
 * LabSheet sub-tab ids hidden per tier. Novices don't reach Lab at all,
 * so their list is empty by construction; an investor-tier viewer gets
 * Lab minus its heaviest tool (stress/correlation modelling).
 */
export const TIER_HIDDEN_LAB_TABS: Record<ExperienceTier, string[]> = {
  novice: [],
  investor: ["risk"],
  advanced: [],
};

const KNOWS_OPTIONS_STORAGE_KEY = "portfell-knows-options";

/**
 * Options familiarity — deliberately separate from ExperienceTier. A
 * "very experienced" investor who's never touched options should still
 * get every options surface removed, not just soft-defaulted-off; an
 * options-savvy novice-tier investor should still see them. Tri-state:
 * null = hasn't answered yet, true = opted in, false = explicitly none.
 * Only `true` shows options UI. Unanswered and "no" both hide it.
 */
export function shouldHideOptions(knowsOptions: boolean | null): boolean {
  return knowsOptions !== true;
}

/**
 * Household / already-filled books skip the first-run questionnaire.
 * Karoliine claiming Karud should land on the shared names, not "Add
 * what you own". Classroom joins skip it in the gate via isPaperClassOnly.
 * A circle invite does not skip: same questions as signing in on Home.
 */
export const HOUSEHOLD_SEED_SLUGS = new Set([
  "karud",
  "lap",
  "aasad",
  "anu",
  "maryann",
]);

export function shouldSkipExperienceOnboarding(input: {
  holdingsCount: number;
  portfolioSlugs: Array<string | null | undefined>;
}): boolean {
  if (input.holdingsCount > 0) return true;
  return input.portfolioSlugs.some(
    (slug) => typeof slug === "string" && HOUSEHOLD_SEED_SLUGS.has(slug)
  );
}

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
  emitExperienceChanged();
}

/**
 * Lab has no options-specific sub-tabs left to hide. `shouldHideOptions`
 * is enforced on the covered-call panel, strike alerts, the Target-call%
 * field, briefing copy, and Margus's tool set. Kept as an empty list so
 * the gating call site stays obvious if an options-only Lab tab comes back.
 */
export const NO_OPTIONS_HIDDEN_LAB_TABS: string[] = [];
