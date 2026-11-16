import "server-only";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ZodError } from "zod";
import { ForbiddenError } from "./permissions";

export type ActionResult = { ok: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;

/** Wraps a server action body: converts thrown validation/permission errors into a friendly result. */
export async function runAction(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      const field = issue?.path?.join(".");
      return { ok: false, error: issue ? `${field ? prettyField(field) + ": " : ""}${issue.message}` : "Invalid input." };
    }
    if (e instanceof ForbiddenError) return { ok: false, error: e.message };
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      return { ok: false, error: "That value is already in use." };
    }
    console.error("[action error]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export class UserError extends Error {}

function prettyField(f: string) {
  return f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/** FormData -> plain object with empty strings converted to undefined. */
export function formObject(fd: FormData): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v === "string") out[k] = v.trim() === "" ? undefined : v.trim();
  }
  return out;
}
