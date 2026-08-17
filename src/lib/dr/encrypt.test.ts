import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptUtf8,
  encryptUtf8,
  parseEncryptionKey,
  SNAPSHOT_CIPHER_PREFIX,
} from "./encrypt";

describe("snapshot encryption", () => {
  const key = parseEncryptionKey(randomBytes(32).toString("hex"));

  it("round-trips UTF-8 JSON", () => {
    const plain = JSON.stringify({ hello: "book", cash: -7000 });
    const token = encryptUtf8(plain, key);
    expect(token.startsWith(SNAPSHOT_CIPHER_PREFIX)).toBe(true);
    expect(decryptUtf8(token, key)).toBe(plain);
  });

  it("rejects a truncated token", () => {
    expect(() => decryptUtf8(`${SNAPSHOT_CIPHER_PREFIX}aaa`, key)).toThrow(
      /truncated/i
    );
  });

  it("rejects a wrong key", () => {
    const token = encryptUtf8("secret", key);
    const other = parseEncryptionKey(randomBytes(32).toString("hex"));
    expect(() => decryptUtf8(token, other)).toThrow();
  });

  it("accepts standard base64 keys", () => {
    const raw = randomBytes(32);
    const parsed = parseEncryptionKey(raw.toString("base64"));
    expect(parsed.equals(raw)).toBe(true);
  });
});
