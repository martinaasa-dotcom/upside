import { randomBytes } from "node:crypto";
import {
  decryptUtf8,
  encryptUtf8,
  SNAPSHOT_CIPHER_PREFIX,
} from "@/lib/dr/encrypt";

export const EXPORT_ALG = "aes-256-gcm";

export type EncryptedExportEnvelope = {
  v: 1;
  alg: typeof EXPORT_ALG;
  unwrap_key: string;
  ciphertext: string;
};

export function encryptExportPayload(plain: string): EncryptedExportEnvelope {
  const key = randomBytes(32);
  return {
    v: 1,
    alg: EXPORT_ALG,
    unwrap_key: key.toString("base64"),
    ciphertext: encryptUtf8(plain, key),
  };
}

export function decryptExportPayload(envelope: EncryptedExportEnvelope): string {
  const key = Buffer.from(envelope.unwrap_key, "base64");
  if (key.length !== 32) {
    throw new Error("Export unwrap key must be 32 bytes.");
  }
  if (!envelope.ciphertext.startsWith(SNAPSHOT_CIPHER_PREFIX)) {
    throw new Error("Not an Upside Lab encrypted export.");
  }
  return decryptUtf8(envelope.ciphertext, key);
}
