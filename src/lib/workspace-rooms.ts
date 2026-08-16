import { loadCommunityListCache } from "@/lib/community-cache";

/** Fired when a kept-alive room is shown again. Pages sync URL / refresh. */
export const WORKSPACE_SHOW_EVENT = "upside:workspace-show";
const LAST_CIRCLE_KEY = "upside-last-circle-id";
const LAST_CIRCLE_EVENT = "upside:last-circle";

let activeRoom: string | null = null;

export function setActiveWorkspaceRoom(id: string | null) {
  activeRoom = id;
}

/** Hidden keep-alive rooms skip their pollers. Unset means the shell has not booted. */
export function isWorkspaceRoomActive(id: string): boolean {
  if (activeRoom == null) return true;
  return activeRoom === id;
}

/**
 * One id per keep-alive pane. Join flows and legal pages return null so
 * they are not cached.
 */
export function workspaceRoomId(pathname: string): string | null {
  if (pathname.startsWith("/communities/join")) return null;
  if (pathname.startsWith("/account/join")) return null;
  if (pathname === "/" || pathname === "") return "book";
  if (pathname.startsWith("/upside-portfolio")) return "fund";
  if (pathname === "/communities" || pathname === "/communities/") {
    return "communities";
  }
  const community = /^\/communities\/([^/]+)\/?$/.exec(pathname);
  if (community?.[1]) return `community:${community[1]}`;
  if (pathname.startsWith("/account")) return "account";
  if (pathname.startsWith("/admin")) return "admin";
  return null;
}

export function saveLastCircleId(communityId: string) {
  if (typeof window === "undefined") return;
  const id = communityId.trim();
  if (!id) return;
  try {
    window.localStorage.setItem(LAST_CIRCLE_KEY, id);
    window.dispatchEvent(new Event(LAST_CIRCLE_EVENT));
  } catch {
    /* quota / private mode */
  }
}

export function loadLastCircleId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const id = window.localStorage.getItem(LAST_CIRCLE_KEY)?.trim();
    return id || null;
  } catch {
    return null;
  }
}

export function lastCircleEventName(): string {
  return LAST_CIRCLE_EVENT;
}

/** Circle dock: the circle you were just in, or the only one you have. */
export function circleHref(): string {
  if (typeof window === "undefined") return "/communities";
  try {
    const list = loadCommunityListCache();
    const last = loadLastCircleId();
    if (last && list?.some((c) => c.id === last)) return `/communities/${last}`;
    if (list?.length === 1 && list[0]) return `/communities/${list[0].id}`;
  } catch {
    /* ignore */
  }
  return "/communities";
}
