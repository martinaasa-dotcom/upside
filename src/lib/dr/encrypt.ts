import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export const SNAPSHOT_CIPHER_PREFIX = "ulenc1.";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

export function parseEncryptionKey(raw: string | undefined): Buffer {
  const t = raw?.trim() ?? "";
  if (!t) {
    throw new Error("SNAPSHOT_ENCRYPTION_KEY is not set.");
  }
  if (/^[0-9a-f]{64}$/i.test(t)) {
    return Buffer.from(t, "hex");
  }
  const fromB64 = Buffer.from(t, "base64");
  if (fromB64.length === KEY_LEN) return fromB64;
  throw new Error(
    "SNAPSHOT_ENCRYPTION_KEY must be 32 bytes as 64 hex chars or standard base64."
  );
}

export function encryptUtf8(plain: string, key: Buffer): string {
  if (key.length !== KEY_LEN) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plain, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return (
    SNAPSHOT_CIPHER_PREFIX +
    Buffer.concat([iv, ciphertext, tag]).toString("base64url")
  );
}

export function decryptUtf8(token: string, key: Buffer): string {
  if (key.length !== KEY_LEN) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const trimmed = token.trim();
  if (!trimmed.startsWith(SNAPSHOT_CIPHER_PREFIX)) {
    throw new Error("Not an Upside Lab encrypted snapshot.");
  }
  const packed = Buffer.from(
    trimmed.slice(SNAPSHOT_CIPHER_PREFIX.length),
    "base64url"
  );
  if (packed.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Encrypted snapshot is truncated.");
  }
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(packed.length - TAG_LEN);
  const ciphertext = packed.subarray(IV_LEN, packed.length - TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

export function isEncryptedSnapshot(token: string): boolean {
  return token.trim().startsWith(SNAPSHOT_CIPHER_PREFIX);
}
