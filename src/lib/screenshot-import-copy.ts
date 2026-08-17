/**
 * Copy for when a screenshot import cannot save holdings.
 * Shared by Margus's reportScreenshotIssue tool, the silent status card,
 * and the chat fallback so the three surfaces never disagree.
 */

export const SCREENSHOT_ISSUE_REASONS = [
  "not_holdings",
  "unreadable",
  "missing_shares",
  "missing_cost",
] as const;

export type ScreenshotIssueReason = (typeof SCREENSHOT_ISSUE_REASONS)[number];

export type ScreenshotIssueCopy = {
  title: string;
  lines: string[];
};

const NEXT_STEPS =
  "Screenshot your broker's holdings page (the one with shares and cost), upload a CSV most brokers export, or type ticker, shares, and cost by hand.";

export function isScreenshotIssueReason(
  value: string
): value is ScreenshotIssueReason {
  return (SCREENSHOT_ISSUE_REASONS as readonly string[]).includes(value);
}

export function screenshotIssueCopy(
  reason: ScreenshotIssueReason
): ScreenshotIssueCopy {
  switch (reason) {
    case "not_holdings":
      return {
        title: "Need a holdings screenshot",
        lines: [
          "This is a price list, not what you own.",
          "Margus needs ticker, how many shares, and what you paid (or the position value). Apple Stocks, a watchlist, or a news screenshot will not work.",
          NEXT_STEPS,
        ],
      };
    case "unreadable":
      return {
        title: "Couldn't read that screenshot",
        lines: [
          "The picture was too cropped, dark, or blurry to pick out the numbers.",
          "Take a closer shot of your broker's holdings page, with ticker, shares, and cost all visible.",
          NEXT_STEPS,
        ],
      };
    case "missing_shares":
      return {
        title: "Missing share counts",
        lines: [
          "Tickers came through, but not how many shares you own.",
          "Open the holdings page that shows share counts, not just prices.",
          NEXT_STEPS,
        ],
      };
    case "missing_cost":
      return {
        title: "Missing what you paid",
        lines: [
          "Tickers and shares came through, but not what you paid. A position value works too.",
          NEXT_STEPS,
        ],
      };
  }
}

/**
 * When the model dies or replies with nothing useful. Covers a wrong
 * picture and a failed read without pretending we saw the image.
 */
export function screenshotImportFallbackCopy(): ScreenshotIssueCopy {
  return {
    title: "Couldn't import that screenshot",
    lines: [
      "Margus could not save any holdings from that picture.",
      "He needs a broker screenshot that shows ticker, how many shares, and what you paid (or the position value). A Stocks app, a watchlist, or a news page will not work.",
      NEXT_STEPS,
    ],
  };
}

export function isGenericScreenshotFail(text: string): boolean {
  return /didn't land|couldn't get a reply|empty reply|not sure that landed|send it again|didn't confirm/i.test(
    text
  );
}
