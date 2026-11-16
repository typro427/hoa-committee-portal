import "server-only";
import { cache } from "react";
import { db } from "./db";

/**
 * The application is designed for multiple HOAs in the future; today it serves
 * a single organization (the first one created by `npm run db:seed`).
 */
export const getOrganization = cache(async () => {
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    throw new Error("No organization found. Run `npm run db:seed` to initialize the database.");
  }
  return org;
});

export const getOrganizationSafe = cache(async () => {
  try {
    return await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  } catch {
    return null;
  }
});
