import { describe, expect, it } from "vitest";
import { inviteNudgeEligible } from "./invite-nudge";
import { funnelFromUsers } from "./admin-funnel";

describe("inviteNudgeEligible", () => {
  const base = {
    classroom: false,
    holdingCountBefore: 0,
    holdingCountAfter: 3,
    dismissed: false,
    alreadyOffered: false,
  };

  it("offers once when the first names land", () => {
    expect(inviteNudgeEligible(base)).toBe(true);
  });

  it("skips classroom sheets", () => {
    expect(inviteNudgeEligible({ ...base, classroom: true })).toBe(false);
  });

  it("skips books that already had holdings", () => {
    expect(inviteNudgeEligible({ ...base, holdingCountBefore: 1 })).toBe(false);
  });

  it("stops after dismiss or a prior offer", () => {
    expect(inviteNudgeEligible({ ...base, dismissed: true })).toBe(false);
    expect(inviteNudgeEligible({ ...base, alreadyOffered: true })).toBe(false);
  });
});

describe("funnelFromUsers", () => {
  const now = Date.parse("2026-08-18T12:00:00.000Z");

  it("counts signed in, holdings, advisor use, and 7-day return", () => {
    const funnel = funnelFromUsers(
      [
        {
          portfolios: [{ id: "a" }],
          holding_count: 4,
          last_sign_in_at: "2026-08-17T10:00:00.000Z",
          last_advisor_at: "2026-08-17T11:00:00.000Z",
        },
        {
          portfolios: [{ id: "b" }],
          holding_count: 0,
          last_sign_in_at: "2026-08-01T10:00:00.000Z",
          last_advisor_at: null,
        },
        {
          portfolios: [],
          holding_count: 0,
          last_sign_in_at: null,
          last_advisor_at: null,
        },
      ],
      now
    );
    expect(funnel.signedIn).toBe(3);
    expect(funnel.hasSheet).toBe(2);
    expect(funnel.hasHoldings).toBe(1);
    expect(funnel.usedAdvisor).toBe(1);
    expect(funnel.returned7d).toBe(1);
    expect(funnel.activated).toBe(1);
  });
});
