// Helpers for CLI scripts (they run outside Next.js, so they don't import "server-only" modules).
import { createHmac, randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";

export function loadEnv() {
  try {
    // Node 20.12+/22: load .env if present (Render injects env vars directly).
    (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    /* no .env file */
  }
}

export function prisma() {
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
}

export const argon = (s: string) => hash(s, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });

export function pinLookup(pin: string) {
  const secret = process.env.PIN_HASH_SECRET;
  if (!secret) throw new Error("PIN_HASH_SECRET is not set");
  return createHmac("sha256", secret).update(`pin:${pin}`).digest("hex");
}

export function randomPin() {
  let p = "";
  for (let i = 0; i < 4; i++) p += randomInt(0, 10);
  if (/^(\d)\1+$/.test(p) || "0123456789".includes(p) || "9876543210".includes(p)) return randomPin();
  return p;
}
