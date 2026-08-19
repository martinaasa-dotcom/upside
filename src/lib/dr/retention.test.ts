import { afterEach, describe, expect, it, vi } from "vitest";
import { keyDate, purgeExpiredColdSnapshots } from "./retention";
import type { ColdStorageConfig } from "./config";

const config: ColdStorageConfig = {
  endpoint: "https://abc.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "upside-lab-backups",
  accessKeyId: "AKIATEST",
  secretAccessKey: "secretsecret",
  prefix: "upside-lab/book-snapshots",
};

describe("keyDate", () => {
  it("reads the date stamped into the object key by objectKeys()", () => {
    const at = keyDate(
      "upside-lab/book-snapshots/2026/08/17/book-2026-08-17T03-00-00-000Z.json.ulenc",
      "upside-lab/book-snapshots"
    );
    expect(at?.toISOString()).toBe("2026-08-17T00:00:00.000Z");
  });

  it("returns null for a key with no parseable date segment", () => {
    expect(keyDate("upside-lab/book-snapshots/README.txt", "upside-lab/book-snapshots")).toBeNull();
  });
});

describe("purgeExpiredColdSnapshots", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes only objects older than the retention window", async () => {
    const listXml = `<?xml version="1.0"?>
<ListBucketResult>
  <Contents><Key>upside-lab/book-snapshots/2026/05/01/book-old.json.ulenc</Key><LastModified>2026-05-01T00:00:00.000Z</LastModified></Contents>
  <Contents><Key>upside-lab/book-snapshots/2026/05/01/book-old.manifest.json</Key><LastModified>2026-05-01T00:00:00.000Z</LastModified></Contents>
  <Contents><Key>upside-lab/book-snapshots/2026/08/17/book-new.json.ulenc</Key><LastModified>2026-08-17T00:00:00.000Z</LastModified></Contents>
  <IsTruncated>false</IsTruncated>
</ListBucketResult>`;

    const deletedKeys: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "GET") {
          return new Response(listXml, { status: 200 });
        }
        if (method === "DELETE") {
          deletedKeys.push(new URL(url).pathname);
          return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected method ${method}`);
      })
    );

    const result = await purgeExpiredColdSnapshots({
      config,
      retentionDays: 90,
      now: new Date("2026-08-19T00:00:00.000Z"),
    });

    expect(result.checked).toBe(3);
    expect(result.deleted).toEqual([
      "upside-lab/book-snapshots/2026/05/01/book-old.json.ulenc",
      "upside-lab/book-snapshots/2026/05/01/book-old.manifest.json",
    ]);
    expect(result.errors).toEqual([]);
    expect(deletedKeys).toHaveLength(2);
  });

  it("keeps going and records an error when one delete fails", async () => {
    const listXml = `<?xml version="1.0"?>
<ListBucketResult>
  <Contents><Key>upside-lab/book-snapshots/2026/01/01/book-old.json.ulenc</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified></Contents>
  <IsTruncated>false</IsTruncated>
</ListBucketResult>`;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "GET") return new Response(listXml, { status: 200 });
        if (method === "DELETE") return new Response("nope", { status: 500 });
        throw new Error(`unexpected method ${method}`);
      })
    );

    const result = await purgeExpiredColdSnapshots({
      config,
      retentionDays: 90,
      now: new Date("2026-08-19T00:00:00.000Z"),
    });

    expect(result.deleted).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/book-old\.json\.ulenc/);
  });
});
