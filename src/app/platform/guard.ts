import "server-only";
import { notFound } from "next/navigation";
import { getTenant, rootDomain } from "@/lib/tenant";

/** The owner console exists only on the main site (or on any address in single-HOA mode). */
export async function platformSiteOnly() {
  const t = await getTenant();
  if (rootDomain() && t.kind !== "platform") notFound();
}
