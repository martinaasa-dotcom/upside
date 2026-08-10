import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 32;

/** Format: scrypt$n=16384$r=8$p=1$<saltB64>$<hashB64> */
export function hashAccessSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$n=${SCRYPT_N}$r=${SCRYPT_R}$p=${SCRYPT_P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyAccessSecret(
  secret: string,
  stored: string | null | undefined
): boolean {
  if (!stored || !secret) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]?.replace("n=", ""));
  const r = Number(parts[2]?.replace("r=", ""));
  const p = Number(parts[3]?.replace("p=", ""));
  const salt = Buffer.from(parts[4] ?? "", "base64");
  const expected = Buffer.from(parts[5] ?? "", "base64");
  if (!salt.length || expected.length !== KEYLEN) return false;
  try {
    const actual = scryptSync(secret, salt, KEYLEN, { N: n, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
