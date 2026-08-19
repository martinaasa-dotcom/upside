import { describe, expect, it } from "vitest";
import {
  scrubSnapshotPayload,
  sliceSnapshotPayload,
  type BookSnapshotPayload,
} from "@/lib/book-snapshot";
import { keepLocalKey } from "@/lib/auth/purge-session";
import { csvEscape, csvSection, rowsToCsv } from "@/lib/gdpr/csv";
import {
  decryptExportPayload,
  encryptExportPayload,
} from "@/lib/gdpr/export-crypto";
import {
  parseExportOptions,
  serializeUserExport,
  toExportCsv,
  type UserDataExport,
} from "@/lib/gdpr/user-export";

function payload(partial?: Partial<BookSnapshotPayload>): BookSnapshotPayload {
  return {
    portfolios: [
      { id: "a", name: "Mine", cash_balance: 10 },
      { id: "b", name: "Theirs", cash_balance: 99 },
    ],
    holdings: [
      { portfolio_id: "a", ticker: "NBIS", shares: 1 },
      { portfolio_id: "b", ticker: "CRWV", shares: 2 },
    ],
    marks: {
      capturedAt: "2026-08-17T00:00:00Z",
      quotes: { NBIS: 1, CRWV: 2 },
      navByPortfolio: { a: 10, b: 99 },
    },
    ...partial,
  };
}

describe("snapshot GDPR slice/scrub", () => {
  it("keeps only owned sheets in an export slice", () => {
    const sliced = sliceSnapshotPayload(payload(), ["a"]);
    expect(sliced?.portfolios).toEqual([{ id: "a", name: "Mine", cash_balance: 10 }]);
    expect(sliced?.holdings).toEqual([
      { portfolio_id: "a", ticker: "NBIS", shares: 1 },
    ]);
    expect(sliced?.marks?.navByPortfolio).toEqual({ a: 10 });
  });

  it("returns null when none of the sheets are yours", () => {
    expect(sliceSnapshotPayload(payload(), ["zzz"])).toBeNull();
  });

  it("drops deleted sheet ids from a mixed snapshot", () => {
    const next = scrubSnapshotPayload(payload(), ["b"]);
    expect(next.portfolios).toHaveLength(1);
    expect((next.portfolios[0] as { id: string }).id).toBe("a");
    expect(next.holdings).toHaveLength(1);
    expect(next.marks?.navByPortfolio).toEqual({ a: 10 });
  });
});

describe("export csv and encryption", () => {
  it("escapes commas and quotes", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape(null)).toBe("");
  });

  it("builds a header from unioned keys", () => {
    expect(rowsToCsv([{ a: 1 }, { a: 2, b: 3 }])).toBe("a,b\n1,\n2,3");
  });

  it("round-trips an encrypted envelope", () => {
    const token = encryptExportPayload('{"ok":true}');
    expect(token.v).toBe(1);
    expect(token.alg).toBe("aes-256-gcm");
    expect(decryptExportPayload(token)).toBe('{"ok":true}');
  });

  it("serializes plaintext JSON for the account download", () => {
    const dump: UserDataExport = {
      exported_at: "2026-08-17T12:00:00.000Z",
      account: { user_id: "u1", email: "a@b.c" },
      profile: { id: "u1", note_sunday: true },
      settings: {
        email_notes: { sunday: true },
        experience_tier: "investor",
        knows_options: false,
      },
      portfolios: [{ id: "p1", name: "Book", cash_balance: 0 }],
      holdings: [{ ticker: "NBIS", shares: 1 }],
      cash_events: [{ delta: 100, balance_after: 100 }],
      snapshots: [],
      lab_state: null,
      communities: [],
      community_duels: [],
      join_requests: [],
      portfolio_invites: [],
      community_invite_uses: [
        { invite_id: "inv1", used_at: "2026-08-01T00:00:00.000Z" },
      ],
    };
    const file = serializeUserExport(dump, { format: "json", encrypt: false });
    expect(file.filename).toBe("upside-export-2026-08-17.json");
    expect(file.body).toContain('"user_id": "u1"');
    expect(file.body).toContain("cash_events");
    const csv = toExportCsv(dump);
    expect(csv).toContain("# holdings");
    expect(csv).toContain("NBIS");
    // Right-to-access covers which invite link they redeemed, and when.
    expect(csv).toContain("# community_invite_uses");
    expect(csv).toContain("inv1");
    expect(file.body).toContain("community_invite_uses");
    expect(csvSection("empty", [])).toBe("# empty\n");
  });

  it("parses format and encrypt query flags", () => {
    const csv = parseExportOptions(
      new Request("https://upsidelab.app/api/user/export?format=csv&encrypt=0"),
      { encrypt: true }
    );
    expect(csv).toEqual({ format: "csv", encrypt: false });
    const enc = parseExportOptions(
      new Request("https://upsidelab.app/api/account/export"),
      { encrypt: false }
    );
    expect(enc).toEqual({ format: "json", encrypt: false });
  });
});

describe("session storage keep list", () => {
  it("keeps the demo Save lock and demo seeds", () => {
    expect(keepLocalKey("portfell-locked")).toBe(true);
    expect(keepLocalKey("portfell-demo-v8")).toBe(true);
    expect(keepLocalKey("upside-analytics-consent-v1")).toBe(true);
    expect(keepLocalKey("upside-last-user-v1")).toBe(false);
    expect(keepLocalKey("upside-book-cache-v1")).toBe(false);
  });
});
