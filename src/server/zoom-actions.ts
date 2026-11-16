"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActor, type Actor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { runAction, UserError, type ActionResult } from "@/lib/action";
import { storeUpload } from "@/lib/storage";
import { formatDate, formatTime, isoToDate } from "@/lib/format";
import { MINUTES_SECTIONS } from "@/lib/minutes-record";
import { parseZoomNotes, vttToText } from "@/lib/zoom-notes";
import { basePath, isUuid } from "./loaders";
import { autoFolderId } from "./folders";

const MAX_NOTES_BYTES = 10 * 1024 * 1024;

async function minutesForImport(actor: Actor, minutesId: string) {
  if (!isUuid(minutesId)) throw new UserError("Minutes not found.");
  const m = await db.meetingMinutes.findUnique({ where: { id: minutesId }, include: { meeting: true } });
  if (!m) throw new UserError("Minutes not found.");
  const c = m.meeting.committeeId;
  assert(can.viewDraftMinutes(actor, c));
  if (m.status === "PUBLISHED") throw new UserError("These minutes are already published. Use Amend to change them.");
  if (m.status === "DRAFT" || m.status === "CHANGES_REQUESTED") assert(can.editDraftMinutes(actor, c));
  else assert(can.reviewMinutes(actor, c), "These minutes are awaiting the chair's review.");
  return m;
}

async function extractText(file: File): Promise<string> {
  if (file.size > MAX_NOTES_BYTES) throw new UserError("That file is too large (10 MB maximum).");
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buf = new Uint8Array(await file.arrayBuffer());
  if (ext === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    try {
      const pdf = await getDocumentProxy(buf);
      const { text } = await pdfText(pdf, { mergePages: true });
      return text as string;
    } catch {
      throw new UserError("Couldn't read that PDF. Try copying the text from Zoom and pasting it instead.");
    }
  }
  const text = new TextDecoder("utf-8").decode(buf);
  if (ext === "vtt") return vttToText(text);
  if (ext === "txt" || ext === "md") return text;
  throw new UserError("Upload the Zoom notes as a PDF, .txt, or .vtt file — or paste the text instead.");
}

/** Step 1: read pasted text or an uploaded file and return the parsed notes for review. */
export async function parseZoomUpload(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesForImport(actor, String(fd.get("minutesId")));
    const pasted = String(fd.get("text") ?? "").trim();
    const file = fd.get("file");
    const hasFile = file instanceof File && file.size > 0;
    if (!pasted && !hasFile) throw new UserError("Paste the Zoom notes or choose a file.");
    const raw = hasFile ? await extractText(file as File) : pasted;
    if (raw.trim().length < 20) throw new UserError("No readable text was found. If this is a scanned PDF, paste the text instead.");
    const parsed = parseZoomNotes(raw.slice(0, 500_000));

    let savedDocument = false;
    const attachable = hasFile && /\.(pdf|txt)$/i.test((file as File).name);
    if (attachable && fd.get("attach") === "on") {
      const stored = await storeUpload(file as File, { organizationId: actor.organizationId, committeeId: m.meeting.committeeId });
      const doc = await db.document.create({
        data: {
          committeeId: m.meeting.committeeId,
          meetingId: m.meetingId,
          title: `Zoom meeting notes — ${formatDate(m.meeting.meetingDate, "short")}`,
          folderId: await autoFolderId(m.meeting.committeeId, true),
          ...stored,
          uploadedByMemberId: actor.kind === "member" ? actor.memberId : null,
          uploadedByAdminId: actor.kind === "admin" ? actor.adminId : null,
        },
      });
      savedDocument = true;
      await audit(actor, { action: "document.uploaded", entityType: "document", entityId: doc.id, committeeId: m.meeting.committeeId, details: { source: "zoom-import" } });
    }
    return { ok: true, data: { parsed, savedDocument, rawText: parsed.recognized ? undefined : raw.slice(0, 20000) } };
  });
}

const SECTION_KEYS = MINUTES_SECTIONS.map(([k]) => k) as [string, ...string[]];
const applySchema = z.object({
  blocks: z.array(z.object({ section: z.enum(SECTION_KEYS), title: z.string().max(300).nullable(), body: z.string().max(50000) })).max(200),
  actions: z.array(z.object({
    text: z.string().min(2).max(300),
    assigneeId: z.string().uuid().nullable(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  })).max(100),
  presentIds: z.array(z.string().uuid()).max(200),
});

/** Step 2: write the reviewed content into the minutes, create action-item tasks, and mark attendance. */
export async function applyZoomImport(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesForImport(actor, String(fd.get("minutesId")));
    const c = m.meeting.committeeId;
    let payload: unknown;
    try {
      payload = JSON.parse(String(fd.get("payload") ?? "{}"));
    } catch {
      throw new UserError("Something went wrong reading the import. Please try again.");
    }
    const d = applySchema.parse(payload);

    const roster = await db.committeeMembership.findMany({
      where: { committeeId: c, isActive: true, member: { status: "ACTIVE" } },
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
    });
    const inRoster = new Map(roster.map((r) => [r.member.id, `${r.member.firstName} ${r.member.lastName}`]));

    // Append each block to its section (existing text is kept).
    const additions: Record<string, string[]> = {};
    for (const b of d.blocks) {
      const body = b.body.trim();
      if (!body) continue;
      (additions[b.section] ??= []).push(b.title ? `${b.title}\n${body}` : body);
    }
    const current = m as unknown as Record<string, string | null>;
    const update: Record<string, string> = {};
    for (const [key, parts] of Object.entries(additions)) {
      const existing = current[key]?.trim();
      update[key] = [existing, ...parts].filter(Boolean).join("\n\n");
    }

    const tasks = d.actions.map((a) => {
      if (a.assigneeId && !inRoster.has(a.assigneeId)) throw new UserError("An assigned person is not an active member of this committee.");
      return {
        committeeId: c,
        meetingId: m.meetingId,
        title: a.text,
        assignedMemberId: a.assigneeId,
        dueDate: a.dueDate ? isoToDate(a.dueDate) : null,
        priority: a.priority,
        createdByMemberId: actor.kind === "member" ? actor.memberId : null,
        createdByAdminId: actor.kind === "admin" ? actor.adminId : null,
      };
    });

    const present = d.presentIds.filter((id) => inRoster.has(id));
    await db.$transaction([
      db.meetingMinutes.update({ where: { id: m.id }, data: update }),
      db.task.createMany({ data: tasks }),
      ...present.map((id) =>
        db.meetingAttendance.upsert({
          where: { meetingId_memberId: { meetingId: m.meetingId, memberId: id } },
          create: { meetingId: m.meetingId, memberId: id, attendeeName: inRoster.get(id)!, attendanceStatus: "PRESENT" },
          update: { attendanceStatus: "PRESENT" },
        }),
      ),
    ]);
    await audit(actor, {
      action: "minutes.imported_from_zoom",
      entityType: "meeting_minutes",
      entityId: m.id,
      committeeId: c,
      details: { sections: Object.keys(update), actionItems: tasks.length, markedPresent: present.length },
    });
    revalidatePath("/", "layout");
    redirect(`${basePath(actor)}/minutes/${m.id}?imported=1`);
  });
}

// ---------------- "Write minutes" shortcut ----------------

const newMeetingSchema = z.object({
  committeeId: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the meeting date"),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  meetingType: z.enum(["REGULAR", "SPECIAL", "ANNUAL_PLANNING", "EMERGENCY", "OTHER"]).default("REGULAR"),
});

/** Starts minutes for an existing meeting, or records a new (usually past) meeting and starts its minutes. */
export async function startMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const then = fd.get("then") === "zoom" ? "zoom" : "edit";
    let meetingId = String(fd.get("meetingId") ?? "");

    if (!meetingId) {
      const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string" && v.trim() !== "")) as Record<string, string>;
      const n = newMeetingSchema.parse(raw);
      const committeeId = actor.kind === "admin" ? n.committeeId : actor.committeeId;
      if (!committeeId) throw new UserError("Choose a committee.");
      assert(can.createMinutes(actor, committeeId), "Only the chair or secretary can prepare minutes.");
      const meetingDate = isoToDate(n.meetingDate);
      const meeting = await db.meeting.create({
        data: {
          committeeId,
          title: n.title,
          meetingType: n.meetingType,
          meetingDate,
          startTime: n.startTime ?? null,
          status: meetingDate.getTime() <= Date.now() ? "COMPLETED" : "SCHEDULED",
          createdByMemberId: actor.kind === "member" ? actor.memberId : null,
          createdByAdminId: actor.kind === "admin" ? actor.adminId : null,
        },
      });
      meetingId = meeting.id;
      await audit(actor, { action: "meeting.created", entityType: "meeting", entityId: meeting.id, committeeId, details: { title: meeting.title, via: "write-minutes" } });
    }

    if (!isUuid(meetingId)) throw new UserError("Meeting not found.");
    const meeting = await db.meeting.findUnique({ where: { id: meetingId }, include: { minutes: true } });
    if (!meeting) throw new UserError("Meeting not found.");
    assert(can.createMinutes(actor, meeting.committeeId), "Only the chair or secretary can prepare minutes.");

    let minutesId = meeting.minutes?.id;
    if (!minutesId) {
      const leaders = await db.committeeMembership.findMany({
        where: { committeeId: meeting.committeeId, isActive: true, role: { in: ["CHAIR", "SECRETARY"] } },
        include: { member: { select: { firstName: true, lastName: true } } },
      });
      const nm = (role: string) => {
        const r = leaders.find((l) => l.role === role);
        return r ? `${r.member.firstName} ${r.member.lastName}` : null;
      };
      const created = await db.meetingMinutes.create({
        data: {
          meetingId,
          chairpersonName: nm("CHAIR"),
          secretaryName: nm("SECRETARY") ?? (actor.kind === "member" ? actor.name : null),
          callToOrder: meeting.startTime ? `The meeting was called to order at ${formatTime(meeting.startTime)}.` : null,
          preparedById: actor.kind === "member" ? actor.memberId : null,
          preparedByAdminId: actor.kind === "admin" ? actor.adminId : null,
        },
      });
      minutesId = created.id;
      await audit(actor, { action: "minutes.created", entityType: "meeting_minutes", entityId: created.id, committeeId: meeting.committeeId, details: { meetingId } });
    }
    revalidatePath("/", "layout");
    redirect(`${basePath(actor)}/minutes/${minutesId}${then === "zoom" ? "/import" : ""}`);
  });
}
