/**
 * The one sentence every room should agree with. Sign-in, empty book,
 * metadata, and README all import this so the story cannot drift.
 *
 * Fund and Communities are rooms you can visit. They are not the product.
 */

export const PRODUCT_NAME = "Upside Lab";

export const PRODUCT_DOMAIN = "upsidelab.app";

export const PRODUCT_ORIGIN = `https://${PRODUCT_DOMAIN}`;

export const PRODUCT_SENTENCE =
  "See what your portfolio did. Ask Margus if the thesis still holds.";

export const PRODUCT_BLURB =
  "A morning read of the names you own. Not another brokerage.";

/** Name used when a first-run import creates the sheet for you. */
export const FIRST_SHEET_NAME = "My portfolio";

/** Sign-in page: the one line under the headline. */
export const SIGNIN_WHO = "Paste what you own. That's the whole start.";

export const SIGNIN_POINTS = [
  "Pulse watches a name when the price jumps, and whether the thesis moved with it.",
  "Margus can read your portfolio and talk it through with you.",
] as const;

export const PRODUCT_CONTACT_EMAIL = "privacy@upsidelab.app";
