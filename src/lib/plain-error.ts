/**
 * Turn an API or thrown error into a sentence a person would say.
 * Snake_case keys and "X required" never reach a toast or banner.
 */

const KNOWN: Record<string, string> = {
  "portfolio_id required": "Pick a sheet first.",
  "portfolioId required": "Pick a sheet first.",
  "id required": "Something went missing. Try again.",
  "name required": "Give it a name first.",
  "cash or holdings required": "Add cash or at least one holding.",
  "token required": "That invite link is missing a code.",
  "Invite code required": "Paste an invite code first.",
  "snapshotId required": "Pick a save first.",
  "snapshotId and portfolioId required": "Pick a save and a sheet first.",
  "This save has none of your sheets.":
    "This save has none of your sheets.",
  "Unknown action": "That action isn't recognized.",
  "No pulse candidates supplied": "Nothing to check yet.",
  "morning or sunday required": "Pick weekdays, Sundays, or both.",
  "userId required": "Pick a person first.",
  "userId and decision required": "Pick approve or decline.",
  "role required": "Pick a role first.",
  "portfolioId and forecast snapshot required": "Need a sheet and a forecast first.",
  "Not a member": "You're not in this circle.",
  "Admin only": "Only an admin can do that.",
  "Already a member": "You're already in this circle.",
  "This community is invite-only": "This circle is invite-only.",
  "Not found": "Couldn't find that.",
  "Member not found": "That person isn't in this circle.",
  "No pending request": "There's no request waiting.",
  "Join failed": "Couldn't join. Try the link again.",
  "Forbidden": "You don't have access to that.",
  "Database unavailable": "The database is taking a break. Try again in a minute.",
  "nothing to update": "Nothing changed.",
  "Nothing to update": "Nothing changed.",
  "Display name must be 1–80 characters":
    "Display name has to be between 1 and 80 characters",
  "Avatar URL must start with http(s)://":
    "Photo link has to start with http:// or https://",
  "invalid visibility": "Pick private or public.",
  "Classes stay invite-only": "Classes stay invite-only.",
  "Not a class": "That isn't a class.",
  "Class sheets stay until the class ends.":
    "Class sheets stay until the class ends.",
  "This class only shows the paper sheet you were given.":
    "This class only shows the paper sheet you were given.",
  "Your class sheet stays in the circle.":
    "Your class sheet stays in the circle.",
  "invalid starting cash":
    "Starting cash has to be between $1,000 and $10,000,000.",
  "Pick what students can do.": "Pick what students can do.",
  "You can buy, sell, and move money.":
    "You can buy, sell, and move money.",
  "You can add names. You cannot sell yet.":
    "You can add names. You cannot sell yet.",
  "The teacher closed the sheet. You can look, you cannot buy or sell.":
    "The teacher closed the sheet. You can look, you cannot buy or sell.",
  "You can sell and move money. You cannot add new names.":
    "You can sell and move money. You cannot add new names.",
  "Invalid ticker": "That ticker doesn't look right.",
  "Invalid tier": "That experience level isn't valid.",
  "Invalid knowsOptions": "That options answer isn't valid.",
  "Unrecognized ticker": "Don't recognize that ticker.",
  "Use community book endpoint for peer portfolios":
    "Open that sheet from the circle, not here.",
  "Supabase not configured": "Cloud save isn't available right now.",
  "Supabase not configured, use local demo store":
    "Cloud save isn't available. This copy of the app is local only.",
  "Supabase not configured, Lab stays local":
    "Cloud save isn't available. Lab stays on this device.",
  "Missing invite token": "That invite link is missing a code.",
  "Lab sync failed": "Couldn't save your Lab notes. They're still on this device.",
};

export function plainError(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  if (KNOWN[s]) return KNOWN[s];
  if (/supabase not configured/i.test(s)) {
    return "Cloud save isn't available right now.";
  }
  if (/^lab sync failed/i.test(s)) {
    return "Couldn't save your Lab notes. They're still on this device.";
  }
  // Bare developer keys: portfolio_id required, foo_bar, HTTP 500 text.
  if (/^[a-z][a-z0-9_]* required$/i.test(s)) return fallback;
  if (/^[a-z]+_[a-z0-9_]+$/i.test(s)) return fallback;
  return s;
}
