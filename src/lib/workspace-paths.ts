import { BOOK_ROOM_PATHS } from "@/lib/seo-routes";

function normalizePath(pathname: string): string {
  const noQuery = pathname.split("?")[0] ?? pathname;
  if (!noQuery || noQuery === "/") return "/";
  return noQuery.replace(/\/+$/, "") || "/";
}

/**
 * One id per keep-alive pane. Join flows and legal pages return null so
 * they are not cached. Kept free of localStorage so crash telemetry can
 * import it without pulling the community cache into every page chunk.
 */
export function workspaceRoomId(pathname: string): string | null {
  const path = normalizePath(pathname);
  if (path.startsWith("/communities/join")) return null;
  if (path.startsWith("/account/join")) return null;
  if ((BOOK_ROOM_PATHS as readonly string[]).includes(path)) return "book";
  if (path.startsWith("/upside-portfolio")) return "fund";
  if (path === "/communities") return "communities";
  const community = /^\/communities\/([^/]+)$/.exec(path);
  if (community?.[1]) return `community:${community[1]}`;
  if (path.startsWith("/account")) return "account";
  if (path.startsWith("/admin")) return "admin";
  return null;
}
