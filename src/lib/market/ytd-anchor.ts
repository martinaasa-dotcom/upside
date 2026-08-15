/** Local pin for the Today chart: a real year-start value the assumed
 * path is scaled to. Not a trade blotter. */

export type YtdAnchor = {
  v: 1;
  source: "manual" | "screenshot";
  startNav: number;
  ytdPct?: number;
};

const KEY = "portfell-ytd-anchor-v1";

export function readYtdAnchor(): YtdAnchor | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as YtdAnchor;
    if (parsed?.v !== 1) return null;
    if (!(parsed.startNav > 0) || !Number.isFinite(parsed.startNav)) {
      return null;
    }
    if (parsed.source !== "manual" && parsed.source !== "screenshot") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeYtdAnchor(anchor: YtdAnchor) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(anchor));
  } catch {
    /* quota / private mode */
  }
}

export function clearYtdAnchor() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
