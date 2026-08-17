import {
  isPaperClassOnly,
  paperClassIds,
} from "@/lib/classroom";
import { loadCommunityListCache } from "@/lib/community-cache";

const KEY = "upside-paper-class-v1";
const EVENT = "upside:paper-class";

export type PaperClassState = {
  only: boolean;
  classIds: string[];
};

const empty: PaperClassState = { only: false, classIds: [] };

let memory: PaperClassState | null = null;

export function paperClassEventName(): string {
  return EVENT;
}

export function paperClassHomeHref(classIds: string[]): string {
  if (classIds.length === 1 && classIds[0]) {
    return `/communities/${classIds[0]}`;
  }
  return "/communities";
}

export function loadPaperClassState(): PaperClassState {
  if (memory) return memory;
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as PaperClassState;
    if (typeof parsed?.only !== "boolean" || !Array.isArray(parsed.classIds)) {
      return empty;
    }
    memory = {
      only: parsed.only,
      classIds: parsed.classIds.filter((id) => typeof id === "string"),
    };
    return memory;
  } catch {
    return empty;
  }
}

export function savePaperClassState(state: PaperClassState) {
  memory = state;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* quota / private mode */
  }
}

export function paperClassStateFrom(
  portfolios: { classroom_community_id?: string | null }[],
  communities: { id?: string; kind?: string | null }[] = loadCommunityListCache() ??
    []
): PaperClassState {
  return {
    only: isPaperClassOnly(portfolios, communities),
    classIds: paperClassIds(portfolios, communities),
  };
}
