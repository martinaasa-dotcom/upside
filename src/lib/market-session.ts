/** Human labels for Yahoo marketState + book day P&L strip. */

export type SessionKind = "open" | "pre" | "ah" | "closed" | "unknown";

/**
 * Live mark and "yesterday's close" for today's P&L.
 *
 * Price is the newest print we have: after-hours leftover still counts
 * after Yahoo flips to CLOSED, until a real pre-market tick starts the
 * next session. Today's change is that mark vs yesterday's official
 * close. Never flatten the baseline to the live price: that zeros Today
 * overnight once after-hours ends.
 *
 * Pre-market is the one special case. Yahoo's regularMarketPrice is
 * still yesterday's close until the open, so that is the baseline, not
 * regularMarketPreviousClose (one session further back).
 */
export function sessionMark(input: {
  marketState: string;
  regularPrice: number | null;
  postPrice: number | null;
  prePrice: number | null;
  previousClose: number | null;
}): { price: number; previousClose: number } {
  const state = (input.marketState ?? "").toUpperCase();
  const { regularPrice, postPrice, prePrice, previousClose } = input;

  const usingPost =
    postPrice != null &&
    (state === "POST" ||
      state === "POSTPOST" ||
      ((state === "CLOSED" || state === "PREPRE") && prePrice == null));
  const usingPre =
    !usingPost &&
    prePrice != null &&
    (state === "PRE" || state === "PREPRE");

  const price = usingPost
    ? postPrice
    : usingPre
      ? prePrice
      : (regularPrice ?? postPrice ?? prePrice ?? 0);

  const baseline = usingPre
    ? (regularPrice ?? price)
    : (previousClose ?? regularPrice ?? price);

  return { price, previousClose: baseline };
}

export function sessionKind(state: string | null | undefined): SessionKind {
  const s = (state ?? "").toUpperCase();
  if (s === "REGULAR") return "open";
  if (s === "PRE" || s === "PREPRE") return "pre";
  if (s === "POST" || s === "POSTPOST") return "ah";
  if (s === "CLOSED" || s === "") return s === "CLOSED" ? "closed" : "unknown";
  return "closed";
}

export function sessionLabel(state: string | null | undefined): string {
  switch (sessionKind(state)) {
    case "open":
      return "Market open";
    case "pre":
      return "Pre-market";
    case "ah":
      return "After hours";
    case "closed":
      return "Market closed";
    default:
      return "Session unknown";
  }
}

export function sessionShort(state: string | null | undefined): string {
  switch (sessionKind(state)) {
    case "open":
      return "Open";
    case "pre":
      return "Pre";
    case "ah":
      return "AH";
    case "closed":
      return "Closed";
    default:
      return "—";
  }
}
