"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { storeUpload } from "@/lib/storage";
import { isUuid } from "./loaders";
import { assertFolderInCommittee, autoFolderId } from "./folders";

async function checkFolder(folderId: string | undefined, committeeId: string) {
  if (!folderId) return;
  try {
    await assertFolderInCommittee(folderId, committeeId);
  } catch {
    throw new UserError("That folder doesn't exist in this committee. Refresh the page and try again.");
  }
}

const docSchema = z.object({
  committeeId: z.string().uuid().optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  folderId: z.string().uuid().optional(),
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

    await checkFolder(d.folderId, committeeId);
    const folderId = d.folderId ?? (await autoFolderId(committeeId, !!meetingId));
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
        folderId,
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
    await checkFolder(d.folderId, doc.committeeId);
    if (d.meetingId) {
      const m = await db.meeting.findFirst({ where: { id: d.meetingId, committeeId: doc.committeeId } });
      if (!m) throw new UserError("Meeting not found.");
    }
    await db.document.update({
      where: { id },
      data: { title: d.title || doc.title, description: d.description ?? null, folderId: d.folderId ?? null, meetingId: d.meetingId ?? null },
    });
    await audit(actor, { action: "document.updated", entityType: "document", entityId: id, committeeId: doc.committeeId, details: { folderId: d.folderId ?? null } });
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

// ---------------- Folders (chair or administrator) ----------------

const folderName = z.string().trim().min(1, "Enter a folder name").max(80, "Folder names can be up to 80 characters");

async function folderNameTaken(committeeId: string, name: string, exceptId?: string) {
  const hit = await db.documentFolder.findFirst({
    where: { committeeId, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true },
  });
  return !!hit;
}

export async function createFolder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const committeeId = actor.kind === "admin" ? z.string().uuid().parse(fd.get("committeeId")) : actor.committeeId;
    assert(can.manageFolders(actor, committeeId), "Only the committee chair or an administrator can manage folders.");
    const name = folderName.parse(fd.get("name"));
    if (await folderNameTaken(committeeId, name)) throw new UserError(`There's already a folder called “${name}”.`);
    const max = await db.documentFolder.aggregate({ where: { committeeId }, _max: { displayOrder: true } });
    const f = await db.documentFolder.create({ data: { committeeId, name, displayOrder: (max._max.displayOrder ?? 0) + 10 } });
    await audit(actor, { action: "folder.created", entityType: "document_folder", entityId: f.id, committeeId, details: { name } });
    revalidatePath("/", "layout");
    return { ok: true, message: `Folder “${name}” added.` };
  });
}

async function folderWithAuth(actorScope: string, folderId: string) {
  const actor = await requireActor(actorScope);
  if (!isUuid(folderId)) throw new UserError("Folder not found.");
  const f = await db.documentFolder.findUnique({ where: { id: folderId } });
  if (!f) throw new UserError("Folder not found.");
  assert(can.manageFolders(actor, f.committeeId), "Only the committee chair or an administrator can manage folders.");
  return { actor, f };
}

export async function renameFolder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { actor, f } = await folderWithAuth(fd.get("scope") as string, String(fd.get("folderId")));
    const name = folderName.parse(fd.get("name"));
    if (name === f.name) return { ok: true };
    if (await folderNameTaken(f.committeeId, name, f.id)) throw new UserError(`There's already a folder called “${name}”.`);
    await db.documentFolder.update({ where: { id: f.id }, data: { name } });
    await audit(actor, { action: "folder.renamed", entityType: "document_folder", entityId: f.id, committeeId: f.committeeId, details: { from: f.name, to: name } });
    revalidatePath("/", "layout");
    return { ok: true, message: `Renamed to “${name}”.` };
  });
}

/** Removes a folder. Its documents are kept and moved to another folder (or Unfiled). */
export async function removeFolder(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { actor, f } = await folderWithAuth(fd.get("scope") as string, String(fd.get("folderId")));
    const moveTo = fd.get("moveTo") ? z.string().uuid().parse(fd.get("moveTo")) : null;
    if (moveTo === f.id) throw new UserError("Choose a different folder to move the documents into.");
    await checkFolder(moveTo ?? undefined, f.committeeId);
    const moved = await db.$transaction(async (tx) => {
      const r = await tx.document.updateMany({ where: { folderId: f.id }, data: { folderId: moveTo } });
      await tx.documentFolder.delete({ where: { id: f.id } });
      return r.count;
    });
    const target = moveTo ? (await db.documentFolder.findUnique({ where: { id: moveTo }, select: { name: true } }))?.name : "Unfiled";
    await audit(actor, { action: "folder.removed", entityType: "document_folder", entityId: f.id, committeeId: f.committeeId, details: { name: f.name, documentsMoved: moved, movedTo: target } });
    revalidatePath("/", "layout");
    // The folder's form disappears with it, so confirm with a banner on the documents page.
    const q = new URLSearchParams({ removedFolder: f.name, moved: String(moved), movedTo: target ?? "Unfiled" });
    if (actor.kind === "admin") q.set("committee", f.committeeId);
    redirect(`${actor.kind === "admin" ? "/admin" : "/portal"}/documents?${q}`);
  });
}
