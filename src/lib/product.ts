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
  "A daily read of your book, with Margus to think it through.";

export const PRODUCT_BLURB =
  "See what moved, check why you own it, and ask when you're unsure.";

/** Name used when a first-run import creates the sheet for you. */
export const FIRST_SHEET_NAME = "My book";

/** Sign-in page: who this is for, one line. */
export const SIGNIN_WHO =
  "Your own book, a circle with friends, or a paper class. Not another brokerage.";

export const SIGNIN_POINTS = [
  "Paste what you own, or start a paper sheet for class.",
  "Pulse checks why you own a name when the price jumps.",
  "Margus can read the sheet and edit it with you.",
  "Invite a partner, a friend, or a class. Optional.",
] as const;

export const PRODUCT_CONTACT_EMAIL = "privacy@upsidelab.app";
