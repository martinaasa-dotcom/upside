import { describe, expect, it } from "vitest";
import { weeklyLetterAlreadySent } from "@/lib/note-cron";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-08-23T04:00:00Z");

describe("weeklyLetterAlreadySent", () => {
  it("never blocks someone who has never been written to", () => {
    expect(weeklyLetterAlreadySent(null, NOW)).toBe(false);
    expect(weeklyLetterAlreadySent(undefined, NOW)).toBe(false);
  });

  it("blocks a resumed run from mailing the same person twice", () => {
    // The first run of the morning stamped them 20 minutes ago.
    const justSent = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    expect(weeklyLetterAlreadySent(justSent, NOW)).toBe(true);
  });

  it("lets next Sunday through", () => {
    const lastWeek = new Date(NOW.getTime() - 7 * DAY).toISOString();
    expect(weeklyLetterAlreadySent(lastWeek, NOW)).toBe(false);
  });

  it("lets a stamp older than the window through", () => {
    const stale = new Date(NOW.getTime() - 3 * DAY - 1000).toISOString();
    expect(weeklyLetterAlreadySent(stale, NOW)).toBe(false);
    const inside = new Date(NOW.getTime() - 3 * DAY + 60_000).toISOString();
    expect(weeklyLetterAlreadySent(inside, NOW)).toBe(true);
  });

  it("treats an unparseable stamp as not sent rather than swallowing a letter", () => {
    expect(weeklyLetterAlreadySent("not a date", NOW)).toBe(false);
  });
});
