"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { storeUpload } from "@/lib/storage";
import { isUuid } from "./loaders";

const CATEGORY = z.enum(["MEETING_DOCUMENTS", "FINANCIAL_REPORTS", "VENDOR_QUOTES", "PROJECT_DOCUMENTS", "POLICIES_AND_PROCEDURES", "GENERAL", "ARCHIVED"]);
const docSchema = z.object({
  committeeId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  category: CATEGORY.default("GENERAL"),
  meetingId: z.string().uuid().optional(),
  agendaItemId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
});

export async function uploadDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const d = docSchema.parse(formObject(fd));
    const file = fd.get("file");
    if (!(file instanceof File)) throw new UserError("Please choose a file to upload.");

    let committeeId = actor.kind === "admin" ? d.committeeId : actor.committeeId;
    let meetingId = d.meetingId ?? null;
    const agendaItemId = d.agendaItemId ?? null;
    const taskId = d.taskId ?? null;

    if (agendaItemId) {
      const ai = await db.agendaItem.findUnique({ where: { id: agendaItemId }, include: { meeting: true } });
      if (!ai) throw new UserError("Agenda item not found.");
      committeeId = actor.kind === "admin" ? ai.meeting.committeeId : committeeId;
      if (ai.meeting.committeeId !== committeeId) throw new UserError("Agenda item not found.");
      meetingId = ai.meetingId;
    }
    let isTaskAssignee = false;
    if (taskId) {
      const t = await db.task.findUnique({ where: { id: taskId } });
      if (!t) throw new UserError("Task not found.");
      committeeId = actor.kind === "admin" ? t.committeeId : committeeId;
      if (t.committeeId !== committeeId) throw new UserError("Task not found.");
      isTaskAssignee = actor.kind === "member" && t.assignedMemberId === actor.memberId;
      meetingId = meetingId ?? t.meetingId;
    }
    if (meetingId && !agendaItemId) {
      const m = await db.meeting.findUnique({ where: { id: meetingId } });
      if (!m) throw new UserError("Meeting not found.");
      committeeId = actor.kind === "admin" ? m.committeeId : committeeId;
      if (m.committeeId !== committeeId) throw new UserError("Meeting not found.");
    }
    if (!committeeId) throw new UserError("Choose a committee.");
    assert(can.manageDocuments(actor, committeeId) || isTaskAssignee, "Only the chair, secretary, or an administrator can upload documents.");

    const stored = await storeUpload(file, { organizationId: actor.organizationId, committeeId });
    const title = d.title || stored.originalFilename.replace(/\.[^.]+$/, "");
    const doc = await db.document.create({
      data: {
        committeeId,
        meetingId,
        agendaItemId,
        taskId,
        title,
        description: d.description ?? null,
        category: meetingId && d.category === "GENERAL" ? "MEETING_DOCUMENTS" : d.category,
        ...stored,
        uploadedByMemberId: actor.kind === "member" ? actor.memberId : null,
        uploadedByAdminId: actor.kind === "admin" ? actor.adminId : null,
      },
    });
    await audit(actor, { action: "document.uploaded", entityType: "document", entityId: doc.id, committeeId, details: { title, file: stored.originalFilename, size: stored.fileSize } });
    revalidatePath("/", "layout");
    return { ok: true, message: `Uploaded “${title}”.` };
  });
}

export async function updateDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const id = String(fd.get("documentId"));
    if (!isUuid(id)) throw new UserError("Document not found.");
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc || doc.removedAt) throw new UserError("Document not found.");
    assert(can.manageDocuments(actor, doc.committeeId));
    const d = docSchema.parse(formObject(fd));
    if (d.meetingId) {
      const m = await db.meeting.findFirst({ where: { id: d.meetingId, committeeId: doc.committeeId } });
      if (!m) throw new UserError("Meeting not found.");
    }
    await db.document.update({
      where: { id },
      data: { title: d.title || doc.title, description: d.description ?? null, category: d.category, meetingId: d.meetingId ?? null },
    });
    await audit(actor, { action: "document.updated", entityType: "document", entityId: id, committeeId: doc.committeeId, details: { category: d.category } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Document updated." };
  });
}

export async function removeDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const id = String(fd.get("documentId"));
    if (!isUuid(id)) throw new UserError("Document not found.");
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc || doc.removedAt) throw new UserError("Document not found.");
    assert(can.manageDocuments(actor, doc.committeeId));
    await db.document.update({ where: { id }, data: { removedAt: new Date() } });
    await audit(actor, { action: "document.removed", entityType: "document", entityId: id, committeeId: doc.committeeId, details: { title: doc.title } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Document removed. An administrator can restore it if needed." };
  });
}

export async function restoreDocument(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor("admin");
    const id = String(fd.get("documentId"));
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) throw new UserError("Document not found.");
    await db.document.update({ where: { id }, data: { removedAt: null } });
    await audit(actor, { action: "document.restored", entityType: "document", entityId: id, committeeId: doc.committeeId, details: { title: doc.title } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Document restored." };
  });
}
