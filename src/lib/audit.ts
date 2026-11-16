import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import type { Actor } from "./session";

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  committeeId?: string | null;
  details?: Record<string, unknown>;
};

/** Records who did what. Never include PINs, hashes, or passwords in details. */
export async function audit(actor: Actor | null, input: AuditInput, organizationId?: string) {
  const orgId = organizationId ?? actor?.organizationId;
  if (!orgId) return;
  await db.auditLog.create({
    data: {
      organizationId: orgId,
      actorMemberId: actor?.kind === "member" ? actor.memberId : null,
      actorAdminId: actor?.kind === "admin" ? actor.adminId : null,
      actorName: actor ? `${actor.name}${actor.kind === "admin" ? " (Admin)" : ""}` : "System",
      committeeId: input.committeeId ?? (actor?.kind === "member" ? actor.committeeId : null),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      detailsJson: (input.details ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
