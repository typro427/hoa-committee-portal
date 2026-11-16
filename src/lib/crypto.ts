import "server-only";
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";
import { env } from "./env";

/** OWASP-recommended Argon2id parameters (19 MiB, 2 iterations). */
const ARGON_OPTS = {
  algorithm: 2, // Algorithm.Argon2id
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PIN_LENGTH = 8;

/** Cryptographically secure 8-digit numeric PIN (no leading-zero bias). */
export function generatePin(length = PIN_LENGTH): string {
  let pin = "";
  for (let i = 0; i < length; i++) pin += randomInt(0, 10).toString();
  // Reject trivially guessable patterns (all same digit, straight sequences).
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    return generatePin(length);
  }
  return pin;
}

/**
 * Deterministic keyed lookup value for a PIN. Lets us find the member in O(1)
 * without storing the PIN; the Argon2id hash is still verified afterwards.
 */
export function pinLookup(pin: string): string {
  return createHmac("sha256", env.pinHashSecret).update(`pin:${pin}`).digest("hex");
}

export function hashSecret(secret: string): Promise<string> {
  return hash(secret, ARGON_OPTS);
}

export async function verifySecret(hashed: string, secret: string): Promise<boolean> {
  try {
    return await verify(hashed, secret);
  } catch {
    return false;
  }
}

// Used to equalize timing when no matching account exists.
let dummyHash: Promise<string> | null = null;
export async function dummyVerify(secret: string) {
  dummyHash ??= hash("dummy-secret-for-timing", ARGON_OPTS);
  await verifySecret(await dummyHash, secret);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string, kind: "member" | "admin"): string {
  const secret = kind === "admin" ? env.adminAuthSecret : env.sessionSecret;
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
