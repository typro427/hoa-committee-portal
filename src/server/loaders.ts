import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, inCommittee } from "@/lib/permissions";
import type { Actor } from "@/lib/session";

/**
 * Data loaders that enforce committee isolation. A member can never load a record
 * from a committee other than their active one — we respond with 404 so the
 * existence of other committees' records is not revealed.
 */

export function basePath(actor: Actor) {
  return actor.kind === "admin" ? "/admin" : "/portal";
}

export async function loadMeeting(actor: Actor, id: string) {
  if (!isUuid(id)) notFound();
  const meeting = await db.meeting.findUnique({
    where: { id },
    include: {
      committee: { select: { id: true, name: true, status: true } },
      agendaItems: { orderBy: [{ displayOrder: "asc" }], include: { documents: { where: { removedAt: null } } } },
      attendance: { orderBy: { attendeeName: "asc" } },
      minutes: { select: { id: true, status: true, publishedAt: true } },
      documents: { where: { removedAt: null }, orderBy: { createdAt: "desc" } },
      tasks: { include: { assignedMember: { select: { firstName: true, lastName: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!meeting || !inCommittee(actor, meeting.committeeId)) notFound();
  return meeting;
}

export async function loadMinutes(actor: Actor, id: string) {
  if (!isUuid(id)) notFound();
  const minutes = await db.meetingMinutes.findUnique({
    where: { id },
    include: {
      meeting: {
        include: {
          committee: { select: { id: true, name: true } },
          attendance: { orderBy: { attendeeName: "asc" } },
          tasks: {
            include: { assignedMember: { select: { firstName: true, lastName: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      motions: { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] },
      preparedBy: { select: { firstName: true, lastName: true } },
      preparedByAdmin: { select: { name: true } },
    },
  });
  if (!minutes || !inCommittee(actor, minutes.meeting.committeeId)) notFound();
  if (minutes.status !== "PUBLISHED" && !can.viewDraftMinutes(actor, minutes.meeting.committeeId)) notFound();
  return minutes;
}

export async function loadTask(actor: Actor, id: string) {
  if (!isUuid(id)) notFound();
  const task = await db.task.findUnique({
    where: { id },
    include: {
      committee: { select: { id: true, name: true } },
      meeting: { select: { id: true, title: true, meetingDate: true } },
      assignedMember: { select: { id: true, firstName: true, lastName: true } },
      createdByMember: { select: { firstName: true, lastName: true } },
      createdByAdmin: { select: { name: true } },
      documents: { where: { removedAt: null }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!task || !inCommittee(actor, task.committeeId)) notFound();
  if (actor.kind === "member" && !can.viewAllCommitteeTasks(actor, task.committeeId) && task.assignedMemberId !== actor.memberId) {
    notFound();
  }
  return task;
}

export async function loadDocument(actor: Actor, id: string) {
  if (!isUuid(id)) notFound();
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      committee: { select: { id: true, name: true } },
      meeting: { select: { id: true, title: true, meetingDate: true } },
      task: { select: { id: true, title: true, assignedMemberId: true } },
      uploadedByMember: { select: { firstName: true, lastName: true } },
      uploadedByAdmin: { select: { name: true } },
    },
  });
  if (!doc || !inCommittee(actor, doc.committeeId)) notFound();
  if (doc.removedAt && actor.kind !== "admin") notFound();
  // Task attachments are visible to the assignee and leadership only.
  if (doc.task && actor.kind === "member" && !can.viewAllCommitteeTasks(actor, doc.committeeId) && doc.task.assignedMemberId !== actor.memberId) {
    notFound();
  }
  return doc;
}

/** Active members of a committee (for pickers, directory, attendance). */
export async function committeeRoster(committeeId: string) {
  const rows = await db.committeeMembership.findMany({
    where: { committeeId, isActive: true, member: { status: "ACTIVE" } },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ member: { lastName: "asc" } }, { member: { firstName: "asc" } }],
  });
  return rows.map((r) => ({
    id: r.member.id,
    name: `${r.member.firstName} ${r.member.lastName}`,
    role: r.role,
    position: r.position,
  }));
}

export function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export function uploaderName(d: { uploadedByMember: { firstName: string; lastName: string } | null; uploadedByAdmin: { name: string } | null }) {
  return d.uploadedByMember ? `${d.uploadedByMember.firstName} ${d.uploadedByMember.lastName}` : d.uploadedByAdmin ? `${d.uploadedByAdmin.name} (Admin)` : "—";
}

/** Unfinished tasks from earlier meetings/independent work, shown on later meeting records. */
export async function carriedForwardTasks(committeeId: string, meetingId: string, meetingDate: Date) {
  const endOfDay = new Date(meetingDate.getTime() + 24 * 3600_000);
  const rows = await db.task.findMany({
    where: {
      committeeId,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      OR: [{ meetingId: null }, { meetingId: { not: meetingId } }],
      createdAt: { lt: endOfDay },
    },
    include: { assignedMember: { select: { firstName: true, lastName: true } } },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    take: 50,
  });
  return rows.map((t) => ({
    title: t.title,
    assignee: t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : null,
    dueDate: t.dueDate ? t.dueDate.toISOString() : null,
    status: t.status,
  }));
}
