import type { MetadataRoute } from "next";
import { getOrganizationSafe } from "@/lib/org";
import { platformName } from "@/lib/tenant";

/** Install manifest. Each HOA's address gets its own app name, so it installs as "Deerfield Committees", etc. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const org = await getOrganizationSafe();
  const short = org ? org.name.replace(/\b(HOA|Homeowners?|Association|Inc\.?|Community)\b/gi, "").replace(/\s+/g, " ").trim() : platformName();
  return {
    name: org ? `${org.name} Committees` : platformName(),
    short_name: (short || "Committees").slice(0, 14),
    description: "Meetings, minutes, documents, and tasks for your HOA committee.",
    start_url: org ? "/portal" : "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f5f9",
    theme_color: "#152340",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
