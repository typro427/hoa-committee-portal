import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { can } from "@/lib/permissions";
import type { Actor } from "@/lib/session";
import { isUuid } from "./loaders";

export function newArbToken() {
  return randomBytes(24).toString("base64url");
}
export function hashArbToken(token: string) {
  return createHmac("sha256", env.sessionSecret).update(`arb:${token}`).digest("hex");
}

/** The committee that reviews resident requests (normally the Architectural Review Board). */
export async function arbCommittee() {
  return db.committee.findFirst({
    where: { handlesArbRequests: true, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true, timezone: true, logoUrl: true } } },
  });
}

export async function nextReferenceNumber(timeZone: string) {
  const year = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(new Date());
  const prefix = `ARB-${year}-`;
  const last = await db.arbRequest.findFirst({ where: { referenceNumber: { startsWith: prefix } }, orderBy: { referenceNumber: "desc" }, select: { referenceNumber: true } });
  const n = last ? Number(last.referenceNumber.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

const requestInclude = {
  committee: { select: { id: true, name: true, organizationId: true } },
  documents: { where: { removedAt: null }, orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "asc" as const } },
};

/** Resident access by private link. Returns null (→ 404) for unknown or malformed tokens. */
export async function loadArbByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  return db.arbRequest.findUnique({ where: { accessTokenHash: hashArbToken(token) }, include: requestInclude });
}

/** Committee access: only members of the reviewing committee (or admins). */
export async function loadArbForActor(actor: Actor, id: string) {
  if (!isUuid(id)) notFound();
  const r = await db.arbRequest.findUnique({
    where: { id },
    include: {
      ...requestInclude,
      documents: {
        where: { removedAt: null },
        orderBy: { createdAt: "asc" },
        include: { uploadedByMember: { select: { firstName: true, lastName: true } }, uploadedByAdmin: { select: { name: true } } },
      },
    },
  });
  if (!r || !can.viewArb(actor, r.committeeId)) notFound();
  return r;
}

/** True when the signed-in member's current committee reviews ARB requests. */
export async function memberHandlesArb(committeeId: string) {
  const c = await db.committee.findUnique({ where: { id: committeeId }, select: { handlesArbRequests: true } });
  return !!c?.handlesArbRequests;
}
