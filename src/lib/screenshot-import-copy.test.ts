import { describe, expect, it } from "vitest";
import {
  isGenericScreenshotFail,
  isScreenshotIssueReason,
  screenshotImportFallbackCopy,
  screenshotIssueCopy,
} from "./screenshot-import-copy";

describe("screenshot import copy", () => {
  it("names what is missing on a watchlist / Stocks app shot", () => {
    const copy = screenshotIssueCopy("not_holdings");
    expect(copy.title).toMatch(/holdings screenshot/i);
    expect(copy.lines.join(" ")).toMatch(/price list/i);
    expect(copy.lines.join(" ")).toMatch(/how many shares/i);
    expect(copy.lines.join(" ")).toMatch(/what you paid/i);
    expect(copy.lines.join(" ")).toMatch(/watchlist/i);
    expect(copy.lines.join(" ")).toMatch(/CSV/i);
    expect(copy.lines.join(" ")).not.toMatch(/—/);
  });

  it("fallback still tells them what to send instead", () => {
    const copy = screenshotImportFallbackCopy();
    expect(copy.lines.join(" ")).toMatch(/broker screenshot/i);
    expect(copy.lines.join(" ")).toMatch(/CSV/i);
    expect(copy.lines.join(" ")).toMatch(/type ticker/i);
    expect(copy.lines.join(" ")).not.toMatch(/Didn't land/);
  });

  it("classifies vague model replies as generic fails", () => {
    expect(isGenericScreenshotFail("Didn't land. Send it again.")).toBe(true);
    expect(isGenericScreenshotFail("Couldn't get a reply just then.")).toBe(
      true
    );
    expect(isGenericScreenshotFail("Imported 4 holdings: NBIS, CRWV")).toBe(
      false
    );
    expect(isScreenshotIssueReason("not_holdings")).toBe(true);
    expect(isScreenshotIssueReason("watchlist")).toBe(false);
  });
});
