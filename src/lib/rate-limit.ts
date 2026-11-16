import "server-only";
import { db } from "./db";

/**
 * Persistent rate limiting / lockouts backed by Postgres (works across instances).
 * Policy:
 *  - 5 failed attempts from one IP within 15 minutes => locked for the rest of that window.
 *  - 200 failed PIN attempts system-wide within 10 minutes => PIN login paused (distributed brute force).
 */
export const LOCKOUT = { maxFailures: 5, windowMinutes: 15 };
const GLOBAL = { maxFailures: 200, windowMinutes: 10 };

async function failuresSince(key: string, minutes: number) {
  const since = new Date(Date.now() - minutes * 60_000);
  const lastSuccess = await db.loginAttempt.findFirst({
    where: { key, success: true, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return db.loginAttempt.count({
    where: { key, success: false, createdAt: { gte: lastSuccess?.createdAt ?? since } },
  });
}

export async function checkLockout(keys: string[], opts?: { global?: string }) {
  for (const key of keys) {
    if ((await failuresSince(key, LOCKOUT.windowMinutes)) >= LOCKOUT.maxFailures) {
      return { locked: true, message: `Too many attempts. Please wait ${LOCKOUT.windowMinutes} minutes and try again.` };
    }
  }
  if (opts?.global) {
    const since = new Date(Date.now() - GLOBAL.windowMinutes * 60_000);
    const n = await db.loginAttempt.count({ where: { key: opts.global, success: false, createdAt: { gte: since } } });
    if (n >= GLOBAL.maxFailures) {
      return { locked: true, message: "Sign-in is temporarily paused due to unusual activity. Please try again shortly." };
    }
  }
  return { locked: false as const, message: "" };
}

export async function recordAttempt(keys: string[], success: boolean) {
  await db.loginAttempt.createMany({ data: keys.map((key) => ({ key, success })) });
  // Opportunistic cleanup of old rows.
  if (Math.random() < 0.02) {
    await db.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  }
}
