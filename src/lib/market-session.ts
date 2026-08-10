/** Human labels for Yahoo marketState + book day P&L strip. */

export type SessionKind = "open" | "pre" | "ah" | "closed" | "unknown";

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
