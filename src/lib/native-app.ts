import "server-only";
import { headers } from "next/headers";

/** The iPhone app adds this to its user agent (see mobile/capacitor.config.json → ios.appendUserAgent). */
export const APP_UA_MARKER = "HOACommitteeApp";

export async function isNativeApp() {
  return ((await headers()).get("user-agent") ?? "").includes(APP_UA_MARKER);
}

/** The app's built-in start screen, where people pick or change their HOA. */
export const APP_SWITCH_HOA_URL = "capacitor://localhost/index.html?switch=1";
