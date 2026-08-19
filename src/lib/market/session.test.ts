import { describe, expect, it } from "vitest";
import { lastCompletedUsSessionKey, tradingDaysBetween } from "./session";

describe("lastCompletedUsSessionKey", () => {
  it("is today once the session has closed on a weekday", () => {
    // 2026-08-18 is a Tuesday. 21:00 UTC is 17:00 ET in August (EDT).
    expect(lastCompletedUsSessionKey(new Date("2026-08-18T21:00:00.000Z"))).toBe(
      "2026-08-18"
    );
  });

  it("is yesterday before the close on a weekday", () => {
    // 12:00 UTC is 08:00 ET, before the 16:00 ET close.
    expect(lastCompletedUsSessionKey(new Date("2026-08-18T12:00:00.000Z"))).toBe(
      "2026-08-17"
    );
  });

  it("walks back over the weekend from Monday morning", () => {
    // 2026-08-17 is a Monday. Before the close, so the last completed
    // session is Friday 2026-08-14.
    expect(lastCompletedUsSessionKey(new Date("2026-08-17T12:00:00.000Z"))).toBe(
      "2026-08-14"
    );
  });
});

describe("tradingDaysBetween", () => {
  it("returns nothing when already caught up", () => {
    expect(tradingDaysBetween("2026-08-18", "2026-08-18")).toEqual([]);
  });

  it("returns the single next weekday", () => {
    expect(tradingDaysBetween("2026-08-17", "2026-08-18")).toEqual([
      "2026-08-18",
    ]);
  });

  it("skips the weekend between a Friday report and a Monday session", () => {
    // Last report Friday 2026-08-14, caught up to Monday 2026-08-17.
    expect(tradingDaysBetween("2026-08-14", "2026-08-17")).toEqual([
      "2026-08-17",
    ]);
  });

  it("lists every missed weekday in order, oldest first", () => {
    // Last report Monday 2026-08-17, now caught up through Thursday.
    expect(tradingDaysBetween("2026-08-17", "2026-08-20")).toEqual([
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
    ]);
  });
});
