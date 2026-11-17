import "server-only";
import { cache } from "react";
import { headers } from "next/headers";

/**
 * Which HOA a request is for, decided from the web address.
 *
 *  - ROOT_DOMAIN not set ("single-HOA mode"): every address serves the first HOA. This keeps an
 *    existing one-HOA deployment (e.g. yourapp.onrender.com) working unchanged.
 *  - ROOT_DOMAIN=yourbrand.com:
 *      yourbrand.com / www.yourbrand.com  → the platform site (landing page, owner console)
 *      deerfield.yourbrand.com            → the HOA whose slug is "deerfield"
 *      any other address (e.g. *.onrender.com) → DEFAULT_ORG_SLUG if set, otherwise the platform site
 */
export type Tenant =
  | { kind: "platform"; rootDomain: string | null }
  | { kind: "hoa"; slug: string | null; rootDomain: string | null }; // slug null = single-HOA mode (first HOA)

export const RESERVED_SLUGS = new Set([
  "www", "app", "api", "admin", "platform", "owner", "mail", "email", "smtp", "ftp", "static", "assets", "cdn",
  "help", "support", "status", "docs", "blog", "billing", "login", "signup", "dashboard", "dev", "staging", "test",
]);

export function rootDomain() {
  return process.env.ROOT_DOMAIN?.trim().toLowerCase().replace(/^\.|\/.*$/g, "") || null;
}

export function tenantFromHost(rawHost: string | null): Tenant {
  const root = rootDomain();
  const host = (rawHost ?? "").toLowerCase().split(":")[0].trim();
  if (!root) return { kind: "hoa", slug: null, rootDomain: null };
  if (host === root || host === `www.${root}`) return { kind: "platform", rootDomain: root };
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (/^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/.test(sub) && !RESERVED_SLUGS.has(sub)) return { kind: "hoa", slug: sub, rootDomain: root };
    return { kind: "platform", rootDomain: root };
  }
  const fallback = process.env.DEFAULT_ORG_SLUG?.trim().toLowerCase();
  return fallback ? { kind: "hoa", slug: fallback, rootDomain: root } : { kind: "platform", rootDomain: root };
}

export const getTenant = cache(async (): Promise<Tenant> => {
  const h = await headers();
  return tenantFromHost(h.get("x-forwarded-host") ?? h.get("host"));
});

/** Public address of an HOA, e.g. https://deerfield.yourbrand.com */
export function hoaUrl(slug: string) {
  const root = rootDomain();
  if (!root) return (process.env.APP_URL ?? "").replace(/\/$/, "");
  const local = root === "localhost" || root.endsWith(".localhost");
  return `${local ? "http" : "https"}://${slug}.${root}${local ? `:${process.env.PORT ?? 3000}` : ""}`;
}

export function platformUrl() {
  const root = rootDomain();
  if (!root) return (process.env.APP_URL ?? "").replace(/\/$/, "");
  const local = root === "localhost" || root.endsWith(".localhost");
  return `${local ? "http" : "https"}://${root}${local ? `:${process.env.PORT ?? 3000}` : ""}`;
}

export function isValidSlug(slug: string) {
  return /^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

/** Brand name of the software itself (set PLATFORM_NAME once you've chosen one). */
export function platformName() {
  return process.env.PLATFORM_NAME?.trim() || "HOA Committee Portal";
}
