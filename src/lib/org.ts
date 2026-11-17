import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { Organization } from "@prisma/client";
import { db } from "./db";
import { getTenant } from "./tenant";

/** The HOA for the current request (from its web address). 404s on the platform site or an unknown HOA. */
export const getOrganization = cache(async (): Promise<Organization> => {
  const org = await getOrganizationSafe();
  if (!org) notFound();
  return org;
});

/** Same as getOrganization but returns null instead of 404. */
export const getOrganizationSafe = cache(async (): Promise<Organization | null> => {
  const tenant = await getTenant();
  if (tenant.kind === "platform") return null;
  try {
    return tenant.slug
      ? await db.organization.findUnique({ where: { slug: tenant.slug } })
      : await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  } catch {
    return null;
  }
});

/**
 * Whether the HOA's account is in good standing. Suspended, cancelled, and expired-trial HOAs
 * keep their data, but members and residents can't use the portal until the account is active.
 * HOA administrators can still sign in (to see the notice and, later, update billing).
 */
export function orgAccess(org: Pick<Organization, "status" | "trialEndsAt">) {
  if (org.status === "SUSPENDED") return { active: false, reason: "suspended" as const };
  if (org.status === "CANCELLED") return { active: false, reason: "cancelled" as const };
  if (org.status === "TRIAL" && org.trialEndsAt && org.trialEndsAt.getTime() < Date.now()) return { active: false, reason: "trial_ended" as const };
  return { active: true, reason: null };
}

export function trialDaysLeft(org: Pick<Organization, "status" | "trialEndsAt">) {
  if (org.status !== "TRIAL" || !org.trialEndsAt) return null;
  return Math.max(0, Math.ceil((org.trialEndsAt.getTime() - Date.now()) / 86400_000));
}
