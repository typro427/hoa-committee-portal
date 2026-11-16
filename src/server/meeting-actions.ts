"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActor, type Actor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { AGENDA_SECTIONS, AGENDA_SECTION_LABELS, isoToDate } from "@/lib/format";
import { basePath, isUuid } from "./loaders";
import { sortAgenda } from "@/lib/agenda";
import { createRevision } from "./minutes-snapshot";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a valid time").optional();
const meetingSchema = z.object({
  committeeId: z.string().uuid().optional(),
  title: z.string().min(2).max(200),
  meetingType: z.enum(["REGULAR", "SPECIAL", "ANNUAL_PLANNING", "EMERGENCY", "OTHER"]),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  startTime: time,
  endTime: time,
  location: z.string().max(300).optional(),
  description: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "POSTPONED"]).optional(),
});

async function committeeFor(actor: Actor, requested?: string) {
  const committeeId = actor.kind === "admin" ? requested : actor.committeeId;
  if (!committeeId) throw new UserError("Choose a committee.");
  const c = await db.committee.findUnique({ where: { id: committeeId } });
  if (!c || c.status !== "ACTIVE") throw new UserError("That committee is not active.");
  return committeeId;
}

async function meetingWithAuth(actor: Actor, id: string, check: (a: Actor, c: string) => boolean) {
  if (!isUuid(id)) throw new UserError("Meeting not found.");
  const m = await db.meeting.findUnique({ where: { id } });
  if (!m) throw new UserError("Meeting not found.");
  assert(check(actor, m.committeeId));
  return m;
}

export async function saveMeeting(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const data = meetingSchema.parse(formObject(fd));
    if (data.startTime && data.endTime && data.endTime <= data.startTime) throw new UserError("End time must be after the start time.");
    const id = fd.get("id") as string | null;
    const fields = {
      title: data.title,
      meetingType: data.meetingType,
      meetingDate: isoToDate(data.meetingDate),
      startTime: data.startTime ?? null,
      endTime: data.endTime ?? null,
      location: data.location ?? null,
      description: data.description ?? null,
      notes: data.notes ?? null,
      ...(data.status ? { status: data.status } : {}),
    };
    let meetingId: string;
    if (id) {
      const existing = await meetingWithAuth(actor, id, can.manageMeetings);
      await db.meeting.update({ where: { id }, data: fields });
      meetingId = id;
      await audit(actor, { action: "meeting.updated", entityType: "meeting", entityId: id, committeeId: existing.committeeId, details: { title: data.title } });
    } else {
      const committeeId = await committeeFor(actor, data.committeeId);
      assert(can.manageMeetings(actor, committeeId), "Only the committee chair or an administrator can create meetings.");
      const m = await db.meeting.create({
        data: {
          ...fields,
          committeeId,
          createdByMemberId: actor.kind === "member" ? actor.memberId : null,
          createdByAdminId: actor.kind === "admin" ? actor.adminId : null,
        },
      });
      meetingId = m.id;
      await audit(actor, { action: "meeting.created", entityType: "meeting", entityId: m.id, committeeId, details: { title: m.title, date: data.meetingDate } });
    }
    revalidatePath("/", "layout");
    redirect(`${basePath(actor)}/meetings/${meetingId}`);
  });
}

export async function setMeetingStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const status = z.enum(["SCHEDULED", "COMPLETED", "CANCELLED", "POSTPONED"]).parse(fd.get("status"));
    const m = await meetingWithAuth(actor, String(fd.get("meetingId")), can.manageMeetings);
    await db.meeting.update({ where: { id: m.id }, data: { status } });
    await audit(actor, { action: "meeting.status_changed", entityType: "meeting", entityId: m.id, committeeId: m.committeeId, details: { from: m.status, to: status } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Meeting status updated." };
  });
}

// ---------------- Agenda ----------------

const agendaSchema = z.object({
  section: z.enum(AGENDA_SECTIONS as [string, ...string[]]),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
});

export async function addAgendaItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await meetingWithAuth(actor, String(fd.get("meetingId")), can.manageAgenda);
    const data = agendaSchema.parse(formObject(fd));
    const max = await db.agendaItem.aggregate({ where: { meetingId: m.id }, _max: { displayOrder: true } });
    const item = await db.agendaItem.create({
      data: {
        meetingId: m.id,
        section: data.section as never,
        title: data.title,
        description: data.description ?? null,
        displayOrder: (max._max.displayOrder ?? 0) + 10,
      },
    });
    await audit(actor, { action: "agenda.item_added", entityType: "agenda_item", entityId: item.id, committeeId: m.committeeId, details: { meetingId: m.id, title: item.title } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Agenda item added." };
  });
}

export async function updateAgendaItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const item = await db.agendaItem.findUnique({ where: { id: String(fd.get("itemId")) }, include: { meeting: true } });
    if (!item) throw new UserError("Agenda item not found.");
    assert(can.manageAgenda(actor, item.meeting.committeeId));
    const data = agendaSchema.parse(formObject(fd));
    await db.agendaItem.update({ where: { id: item.id }, data: { section: data.section as never, title: data.title, description: data.description ?? null } });
    await audit(actor, { action: "agenda.item_updated", entityType: "agenda_item", entityId: item.id, committeeId: item.meeting.committeeId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved." };
  });
}

export async function deleteAgendaItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const item = await db.agendaItem.findUnique({ where: { id: String(fd.get("itemId")) }, include: { meeting: true } });
    if (!item) throw new UserError("Agenda item not found.");
    assert(can.manageAgenda(actor, item.meeting.committeeId));
    await db.agendaItem.delete({ where: { id: item.id } });
    await audit(actor, { action: "agenda.item_removed", entityType: "agenda_item", entityId: item.id, committeeId: item.meeting.committeeId, details: { title: item.title } });
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Moves an item up/down; crossing into the neighbouring item's section moves it to that section. */
export async function moveAgendaItem(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const dir = fd.get("direction") === "up" ? -1 : 1;
    const item = await db.agendaItem.findUnique({ where: { id: String(fd.get("itemId")) }, include: { meeting: true } });
    if (!item) throw new UserError("Agenda item not found.");
    assert(can.manageAgenda(actor, item.meeting.committeeId));
    const items = sortAgenda(await db.agendaItem.findMany({ where: { meetingId: item.meetingId } }));
    const idx = items.findIndex((i) => i.id === item.id);
    const target = idx + dir;
    if (target < 0 || target >= items.length) return { ok: true };
    const other = items[target];
    if (other.section !== item.section) {
      // Move into the adjacent section rather than swapping across sections.
      await db.agendaItem.update({
        where: { id: item.id },
        data: { section: other.section, displayOrder: dir < 0 ? other.displayOrder + 1 : other.displayOrder - 1 },
      });
    } else {
      await db.$transaction([
        db.agendaItem.update({ where: { id: item.id }, data: { displayOrder: other.displayOrder } }),
        db.agendaItem.update({ where: { id: other.id }, data: { displayOrder: item.displayOrder } }),
      ]);
    }
    // Normalize ordering.
    const fresh = sortAgenda(await db.agendaItem.findMany({ where: { meetingId: item.meetingId } }));
    await db.$transaction(fresh.map((f, i) => db.agendaItem.update({ where: { id: f.id }, data: { displayOrder: (i + 1) * 10 } })));
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function insertStandardAgenda(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await meetingWithAuth(actor, String(fd.get("meetingId")), can.manageAgenda);
    const existing = await db.agendaItem.findMany({ where: { meetingId: m.id }, select: { section: true } });
    const have = new Set(existing.map((e) => e.section));
    const toAdd = AGENDA_SECTIONS.filter((s) => !have.has(s as never));
    await db.agendaItem.createMany({
      data: toAdd.map((s) => ({
        meetingId: m.id,
        section: s as never,
        title: AGENDA_SECTION_LABELS[s],
        displayOrder: (AGENDA_SECTIONS.indexOf(s) + 1) * 1000,
      })),
    });
    await audit(actor, { action: "agenda.standard_inserted", entityType: "meeting", entityId: m.id, committeeId: m.committeeId });
    revalidatePath("/", "layout");
    return { ok: true, message: toAdd.length ? "Standard agenda sections added." : "All standard sections are already on the agenda." };
  });
}

// ---------------- Attendance ----------------

export async function saveAttendance(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await meetingWithAuth(actor, String(fd.get("meetingId")), can.recordAttendance);
    await assertMinutesEditable(actor, m.id, fd);
    const roster = await db.committeeMembership.findMany({
      where: { committeeId: m.committeeId, isActive: true },
      include: { member: { select: { id: true, firstName: true, lastName: true } } },
    });
    const ops = [];
    for (const r of roster) {
      const v = fd.get(`att_${r.member.id}`);
      if (v !== "PRESENT" && v !== "ABSENT" && v !== "EXCUSED") continue;
      ops.push(
        db.meetingAttendance.upsert({
          where: { meetingId_memberId: { meetingId: m.id, memberId: r.member.id } },
          create: { meetingId: m.id, memberId: r.member.id, attendeeName: `${r.member.firstName} ${r.member.lastName}`, attendanceStatus: v },
          update: { attendanceStatus: v },
        }),
      );
    }
    await db.$transaction(ops);
    await audit(actor, { action: "attendance.recorded", entityType: "meeting", entityId: m.id, committeeId: m.committeeId, details: { count: ops.length } });
    await snapshotIfPublished(actor, m.id, "Attendance updated");
    revalidatePath("/", "layout");
    return { ok: true, message: "Attendance saved." };
  });
}

export async function addGuest(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await meetingWithAuth(actor, String(fd.get("meetingId")), can.recordAttendance);
    await assertMinutesEditable(actor, m.id, fd);
    const name = z.string().min(2).max(150).parse(String(fd.get("name") ?? "").trim());
    const notes = String(fd.get("notes") ?? "").trim().slice(0, 300) || null;
    await db.meetingAttendance.create({ data: { meetingId: m.id, attendeeName: name, attendanceStatus: "GUEST", notes } });
    await audit(actor, { action: "attendance.guest_added", entityType: "meeting", entityId: m.id, committeeId: m.committeeId, details: { name } });
    await snapshotIfPublished(actor, m.id, `Guest added: ${name}`);
    revalidatePath("/", "layout");
    return { ok: true, message: "Guest added." };
  });
}

export async function removeAttendee(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const a = await db.meetingAttendance.findUnique({ where: { id: String(fd.get("attendanceId")) }, include: { meeting: true } });
    if (!a) throw new UserError("Not found.");
    assert(can.recordAttendance(actor, a.meeting.committeeId));
    await assertMinutesEditable(actor, a.meetingId, fd);
    await db.meetingAttendance.delete({ where: { id: a.id } });
    await audit(actor, { action: "attendance.removed", entityType: "meeting", entityId: a.meetingId, committeeId: a.meeting.committeeId, details: { name: a.attendeeName } });
    await snapshotIfPublished(actor, a.meetingId, `Attendee removed: ${a.attendeeName}`);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

/** Attendance is part of the official record once minutes are submitted/published. */
async function assertMinutesEditable(actor: Actor, meetingId: string, _fd: FormData) {
  const minutes = await db.meetingMinutes.findUnique({ where: { meetingId }, include: { meeting: true } });
  if (!minutes) return;
  const c = minutes.meeting.committeeId;
  if (minutes.status === "PUBLISHED") assert(can.amendPublishedMinutes(actor, c), "Only the chair or an administrator can amend published minutes.");
  else if (minutes.status === "SUBMITTED" || minutes.status === "APPROVED") assert(can.reviewMinutes(actor, c), "These minutes are awaiting the chair's review.");
}

async function snapshotIfPublished(actor: Actor, meetingId: string, reason: string) {
  const minutes = await db.meetingMinutes.findUnique({ where: { meetingId }, select: { id: true, status: true } });
  if (minutes?.status === "PUBLISHED") {
    await createRevision(actor, minutes.id, reason);
  }
}
