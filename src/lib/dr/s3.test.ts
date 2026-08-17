import { describe, expect, it } from "vitest";
import { awsEncode, objectUri, signS3Request } from "./s3";
import type { ColdStorageConfig } from "./config";

const r2: ColdStorageConfig = {
  endpoint: "https://abc.r2.cloudflarestorage.com",
  region: "auto",
  bucket: "upside-lab-backups",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  prefix: "upside-lab/book-snapshots",
};

describe("S3/R2 signer", () => {
  it("encodes object keys without touching slashes in the path", () => {
    expect(objectUri("upside-lab/book-snapshots/a b.json")).toBe(
      "/upside-lab/book-snapshots/a%20b.json"
    );
    expect(awsEncode("a b", false)).toBe("a%20b");
  });

  it("signs R2 path-style PUTs stably for a frozen clock", () => {
    const at = new Date("2026-08-17T12:00:00.000Z");
    const body = Buffer.from("hello");
    const a = signS3Request({
      config: r2,
      method: "PUT",
      key: "upside-lab/book-snapshots/x.json.ulenc",
      body,
      at,
    });
    const b = signS3Request({
      config: r2,
      method: "PUT",
      key: "upside-lab/book-snapshots/x.json.ulenc",
      body,
      at,
    });
    expect(a.url).toBe(
      "https://abc.r2.cloudflarestorage.com/upside-lab-backups/upside-lab/book-snapshots/x.json.ulenc"
    );
    expect(a.headers.authorization).toBe(b.headers.authorization);
    expect(a.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=/);
    expect(a.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("lists against the bucket root, not a trailing slash", () => {
    const signed = signS3Request({
      config: r2,
      method: "GET",
      key: "",
      query: { "list-type": "2", prefix: "upside-lab/" },
      at: new Date("2026-08-17T12:00:00.000Z"),
    });
    expect(signed.url).toContain("/upside-lab-backups?");
    expect(signed.url).toContain("list-type=2");
    expect(signed.url).not.toContain("/upside-lab-backups/?");
  });
});
