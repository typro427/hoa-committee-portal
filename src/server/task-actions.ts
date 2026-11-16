"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActor, type Actor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { isoToDate } from "@/lib/format";
import { basePath, isUuid } from "./loaders";
import { createRevision } from "./minutes-snapshot";

const STATUS = z.enum(["NOT_STARTED", "IN_PROGRESS", "WAITING_ON_INFORMATION", "COMPLETED", "CANCELLED"]);
const taskSchema = z.object({
  committeeId: z.string().uuid().optional(),
  title: z.string().min(2).max(300),
  description: z.string().max(10000).optional(),
  assignedMemberId: z.string().uuid().optional(),
  meetingId: z.string().uuid().optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  status: STATUS.optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

async function validateRefs(committeeId: string, assignedMemberId?: string, meetingId?: string) {
  if (assignedMemberId) {
    const ok = await db.committeeMembership.findFirst({ where: { committeeId, memberId: assignedMemberId, isActive: true, member: { status: "ACTIVE" } } });
    if (!ok) throw new UserError("The assigned member is not an active member of this committee.");
  }
  if (meetingId) {
    const ok = await db.meeting.findFirst({ where: { id: meetingId, committeeId } });
    if (!ok) throw new UserError("That meeting does not belong to this committee.");
  }
}

function completion(actor: Actor, to: string, from?: string) {
  if (to === "COMPLETED" && from !== "COMPLETED") {
    return {
      completedAt: new Date(),
      completedByMemberId: actor.kind === "member" ? actor.memberId : null,
      completedByName: actor.name + (actor.kind === "admin" ? " (Admin)" : ""),
    };
  }
  if (to !== "COMPLETED" && from === "COMPLETED") return { completedAt: null, completedByMemberId: null, completedByName: null };
  return {};
}

export async function saveTask(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const d = taskSchema.parse(formObject(fd));
    const id = fd.get("id") ? String(fd.get("id")) : null;
    const stay = fd.get("stay") === "1";
    let taskId: string;
    if (id) {
      if (!isUuid(id)) throw new UserError("Task not found.");
      const t = await db.task.findUnique({ where: { id } });
      if (!t) throw new UserError("Task not found.");
      assert(can.manageTasks(actor, t.committeeId));
      await validateRefs(t.committeeId, d.assignedMemberId, d.meetingId);
      const status = d.status ?? t.status;
      await db.task.update({
        where: { id },
        data: {
          title: d.title,
          description: d.description ?? null,
          assignedMemberId: d.assignedMemberId ?? null,
          meetingId: d.meetingId ?? null,
          priority: d.priority,
          status,
          dueDate: d.dueDate ? isoToDate(d.dueDate) : null,
          ...completion(actor, status, t.status),
        },
      });
      taskId = id;
      await audit(actor, { action: "task.updated", entityType: "task", entityId: id, committeeId: t.committeeId, details: { title: d.title, status } });
    } else {
      const committeeId = actor.kind === "admin" ? d.committeeId : actor.committeeId;
      if (!committeeId) throw new UserError("Choose a committee.");
      assert(can.manageTasks(actor, committeeId), "Only the chair, secretary, or an administrator can create tasks.");
      await validateRefs(committeeId, d.assignedMemberId, d.meetingId);
      const status = d.status ?? "NOT_STARTED";
      const t = await db.task.create({
        data: {
          committeeId,
          title: d.title,
          description: d.description ?? null,
          assignedMemberId: d.assignedMemberId ?? null,
          meetingId: d.meetingId ?? null,
          priority: d.priority,
          status,
          dueDate: d.dueDate ? isoToDate(d.dueDate) : null,
          createdByMemberId: actor.kind === "member" ? actor.memberId : null,
          createdByAdminId: actor.kind === "admin" ? actor.adminId : null,
          ...completion(actor, status),
        },
      });
      taskId = t.id;
      await audit(actor, { action: "task.created", entityType: "task", entityId: t.id, committeeId, details: { title: t.title, assignedMemberId: t.assignedMemberId, meetingId: t.meetingId } });
      // Adding an action item to published minutes is a change to the official record.
      if (d.meetingId) {
        const minutes = await db.meetingMinutes.findUnique({ where: { meetingId: d.meetingId }, select: { id: true, status: true } });
        if (minutes?.status === "PUBLISHED") {
          await createRevision(actor, minutes.id, `Action item added: ${t.title}`);
        }
      }
    }
    revalidatePath("/", "layout");
    if (stay) return { ok: true, message: "Action item added." };
    redirect(`${basePath(actor)}/tasks/${taskId}`);
  });
}

export async function updateTaskStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const id = String(fd.get("taskId"));
    if (!isUuid(id)) throw new UserError("Task not found.");
    const t = await db.task.findUnique({ where: { id } });
    if (!t) throw new UserError("Task not found.");
    const isAssignee = actor.kind === "member" && actor.committeeId === t.committeeId && t.assignedMemberId === actor.memberId;
    assert(isAssignee || can.manageTasks(actor, t.committeeId), "You can only update tasks assigned to you.");
    const status = STATUS.parse(fd.get("status"));
    const notesRaw = fd.get("completionNotes");
    const completionNotes = notesRaw === null ? t.completionNotes : String(notesRaw).trim().slice(0, 10000) || null;
    await db.task.update({ where: { id }, data: { status, completionNotes, ...completion(actor, status, t.status) } });
    await audit(actor, { action: "task.status_changed", entityType: "task", entityId: id, committeeId: t.committeeId, details: { from: t.status, to: status } });
    revalidatePath("/", "layout");
    return { ok: true, message: status === "COMPLETED" ? "Task marked complete. Thank you!" : "Task updated." };
  });
}
