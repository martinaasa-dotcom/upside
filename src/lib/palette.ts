/**
 * Hex used in SVG, email, and canvas. Keep in lockstep with `globals.css`.
 * Nova dark field. Primary is a subtle warm yellow (`--primary`, see
 * DESIGN_TOKENS.md). Green / red for up / down only. Teal and steel are
 * for the Compound four-path chart, not page chrome.
 */
export const PALETTE = {
  app: "#000000",
  well: "#262626",
  card: "#171717",
  raised: "#262626",
  cream: "#fafafa",
  ink: "#000000",
  muted: "#a1a1a1",
  brand: "#d4bc79",
  brandBright: "#d4bc79",
  bronze: "#d4bc79",
  teal: "#2dd4bf",
  gain: "#34d399",
  loss: "#f43f5e",
  steel: "#60a5fa",
} as const;
