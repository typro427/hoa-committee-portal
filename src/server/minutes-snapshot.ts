import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { audit } from "@/lib/audit";

/** Full point-in-time copy of a minutes record (fields, motions, attendance, action items). */
export async function minutesSnapshot(minutesId: string) {
  const m = await db.meetingMinutes.findUniqueOrThrow({
    where: { id: minutesId },
    include: {
      motions: { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] },
      meeting: {
        include: {
          committee: { select: { name: true } },
          attendance: true,
          tasks: { select: { id: true, title: true, status: true, dueDate: true, priority: true, assignedMemberId: true, assignedMember: { select: { firstName: true, lastName: true } } } },
        },
      },
    },
  });
  return JSON.parse(JSON.stringify(m)) as Prisma.InputJsonValue;
}

/** Records an immutable revision. Used on publish and on every change to published minutes. */
export async function createRevision(actor: Actor, minutesId: string, reason: string) {
  const last = await db.meetingMinuteRevision.findFirst({ where: { minutesId }, orderBy: { revisionNumber: "desc" } });
  const rev = await db.meetingMinuteRevision.create({
    data: {
      minutesId,
      revisionNumber: (last?.revisionNumber ?? 0) + 1,
      snapshotJson: await minutesSnapshot(minutesId),
      changedById: actor.kind === "member" ? actor.memberId : null,
      changedByAdminId: actor.kind === "admin" ? actor.adminId : null,
      changedByName: actor.name + (actor.kind === "admin" ? " (Admin)" : ""),
      changeReason: reason.slice(0, 1000),
    },
  });
  await audit(actor, { action: "minutes.revision_created", entityType: "meeting_minutes", entityId: minutesId, details: { revision: rev.revisionNumber, reason } });
  return rev;
}
