"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireActor, type Actor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { basePath, isUuid } from "./loaders";
import { createRevision } from "./minutes-snapshot";
import { formatTime } from "@/lib/format";

async function minutesWithAuth(actor: Actor, id: string) {
  if (!isUuid(id)) throw new UserError("Minutes not found.");
  const m = await db.meetingMinutes.findUnique({ where: { id }, include: { meeting: true } });
  if (!m) throw new UserError("Minutes not found.");
  assert(can.viewDraftMinutes(actor, m.meeting.committeeId));
  return m;
}

/** Who may change the content of minutes in a given status. */
function assertCanEdit(actor: Actor, status: string, committeeId: string) {
  if (status === "DRAFT" || status === "CHANGES_REQUESTED") return assert(can.editDraftMinutes(actor, committeeId));
  if (status === "SUBMITTED" || status === "APPROVED") return assert(can.reviewMinutes(actor, committeeId), "These minutes are awaiting the chair's review.");
  if (status === "PUBLISHED") return assert(can.amendPublishedMinutes(actor, committeeId), "Only the chair or an administrator can amend published minutes.");
}

async function chairAndSecretary(committeeId: string) {
  const leaders = await db.committeeMembership.findMany({
    where: { committeeId, isActive: true, role: { in: ["CHAIR", "SECRETARY"] } },
    include: { member: { select: { firstName: true, lastName: true } } },
  });
  const nm = (r: (typeof leaders)[number] | undefined) => (r ? `${r.member.firstName} ${r.member.lastName}` : null);
  return { chair: nm(leaders.find((l) => l.role === "CHAIR")), secretary: nm(leaders.find((l) => l.role === "SECRETARY")) };
}

export async function createMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const meetingId = String(fd.get("meetingId"));
    if (!isUuid(meetingId)) throw new UserError("Meeting not found.");
    const meeting = await db.meeting.findUnique({ where: { id: meetingId }, include: { minutes: true, agendaItems: true } });
    if (!meeting) throw new UserError("Meeting not found.");
    assert(can.createMinutes(actor, meeting.committeeId), "Only the chair or secretary can prepare minutes.");
    if (meeting.minutes) redirect(`${basePath(actor)}/minutes/${meeting.minutes.id}`);
    const { chair, secretary } = await chairAndSecretary(meeting.committeeId);
    const minutes = await db.meetingMinutes.create({
      data: {
        meetingId,
        chairpersonName: chair,
        secretaryName: secretary ?? (actor.kind === "member" ? actor.name : null),
        callToOrder: meeting.startTime ? `The meeting was called to order at ${formatTime(meeting.startTime)}.` : null,
        preparedById: actor.kind === "member" ? actor.memberId : null,
        preparedByAdminId: actor.kind === "admin" ? actor.adminId : null,
      },
    });
    await audit(actor, { action: "minutes.created", entityType: "meeting_minutes", entityId: minutes.id, committeeId: meeting.committeeId, details: { meetingId } });
    revalidatePath("/", "layout");
    redirect(`${basePath(actor)}/minutes/${minutes.id}`);
  });
}

const minutesSchema = z.object({
  chairpersonName: z.string().max(150).optional(),
  secretaryName: z.string().max(150).optional(),
  callToOrder: z.string().max(20000).optional(),
  previousMinutes: z.string().max(20000).optional(),
  oldBusiness: z.string().max(50000).optional(),
  newBusiness: z.string().max(50000).optional(),
  committeeReports: z.string().max(50000).optional(),
  projectUpdates: z.string().max(50000).optional(),
  recommendations: z.string().max(50000).optional(),
  otherBusiness: z.string().max(50000).optional(),
  adjournmentTime: z.string().max(20).optional(),
  closingNotes: z.string().max(20000).optional(),
  changeReason: z.string().max(1000).optional(),
});

export async function saveMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesWithAuth(actor, String(fd.get("minutesId")));
    assertCanEdit(actor, m.status, m.meeting.committeeId);
    const data = minutesSchema.parse(formObject(fd));
    if (m.status === "PUBLISHED" && !data.changeReason) {
      throw new UserError("Published minutes can't be changed silently. Enter a reason for this amendment.");
    }
    const { changeReason, ...fields } = data;
    const update = Object.fromEntries(
      Object.keys(minutesSchema.shape).filter((k) => k !== "changeReason").map((k) => [k, (fields as Record<string, string | undefined>)[k] ?? null]),
    );
    await db.meetingMinutes.update({ where: { id: m.id }, data: update });
    await audit(actor, { action: m.status === "PUBLISHED" ? "minutes.amended" : "minutes.saved", entityType: "meeting_minutes", entityId: m.id, committeeId: m.meeting.committeeId, details: changeReason ? { reason: changeReason } : undefined });
    if (m.status === "PUBLISHED") await createRevision(actor, m.id, `Amendment: ${changeReason}`);
    revalidatePath("/", "layout");
    return { ok: true, message: m.status === "PUBLISHED" ? "Amendment saved and recorded as a new revision." : "Minutes saved." };
  });
}

export async function submitMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesWithAuth(actor, String(fd.get("minutesId")));
    assert(can.editDraftMinutes(actor, m.meeting.committeeId));
    if (m.status !== "DRAFT" && m.status !== "CHANGES_REQUESTED") throw new UserError("Only draft minutes can be submitted.");
    await db.meetingMinutes.update({ where: { id: m.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    await audit(actor, { action: "minutes.submitted", entityType: "meeting_minutes", entityId: m.id, committeeId: m.meeting.committeeId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Submitted to the chair for review." };
  });
}

export async function returnMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesWithAuth(actor, String(fd.get("minutesId")));
    assert(can.reviewMinutes(actor, m.meeting.committeeId), "Only the chair or an administrator can return minutes.");
    if (m.status !== "SUBMITTED" && m.status !== "APPROVED") throw new UserError("Only submitted minutes can be returned.");
    const comment = z.string().min(3, "Explain what needs to be corrected").max(5000).parse(String(fd.get("comment") ?? "").trim());
    await db.meetingMinutes.update({ where: { id: m.id }, data: { status: "CHANGES_REQUESTED", reviewComments: comment, approvedAt: null, approvedById: null, approvedByAdminId: null, approvedByName: null } });
    await audit(actor, { action: "minutes.returned", entityType: "meeting_minutes", entityId: m.id, committeeId: m.meeting.committeeId, details: { comment } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Returned for corrections." };
  });
}

function approver(actor: Actor) {
  return {
    approvedById: actor.kind === "member" ? actor.memberId : null,
    approvedByAdminId: actor.kind === "admin" ? actor.adminId : null,
    approvedByName: actor.name,
    approvedAt: new Date(),
  };
}

export async function approveMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesWithAuth(actor, String(fd.get("minutesId")));
    assert(can.reviewMinutes(actor, m.meeting.committeeId), "Only the chair or an administrator can approve minutes.");
    if (m.status === "PUBLISHED" || m.status === "APPROVED") throw new UserError("These minutes are already approved.");
    await db.meetingMinutes.update({ where: { id: m.id }, data: { status: "APPROVED", reviewComments: null, ...approver(actor) } });
    await audit(actor, { action: "minutes.approved", entityType: "meeting_minutes", entityId: m.id, committeeId: m.meeting.committeeId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Minutes approved. Publish them when ready to share with the committee." };
  });
}

export async function publishMinutes(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesWithAuth(actor, String(fd.get("minutesId")));
    assert(can.publishMinutes(actor, m.meeting.committeeId), "Only the chair or an administrator can publish minutes.");
    if (m.status === "PUBLISHED") throw new UserError("Already published.");
    const isSecretary = actor.kind === "member" && actor.role === "SECRETARY";
    if (isSecretary && m.status !== "APPROVED" && m.status !== "SUBMITTED") {
      throw new UserError("Submit the minutes before publishing.");
    }
    await db.meetingMinutes.update({
      where: { id: m.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        reviewComments: null,
        ...(m.approvedAt ? {} : approver(actor)),
      },
    });
    if (m.meeting.status === "SCHEDULED") await db.meeting.update({ where: { id: m.meetingId }, data: { status: "COMPLETED" } });
    await audit(actor, { action: "minutes.published", entityType: "meeting_minutes", entityId: m.id, committeeId: m.meeting.committeeId });
    await createRevision(actor, m.id, "Published");
    revalidatePath("/", "layout");
    return { ok: true, message: "Minutes published. Committee members can now view and download them." };
  });
}

// ---------------- Motions ----------------

const motionSchema = z.object({
  description: z.string().min(3).max(5000),
  movedById: z.string().uuid().optional(),
  movedByName: z.string().max(150).optional(),
  secondedById: z.string().uuid().optional(),
  secondedByName: z.string().max(150).optional(),
  votesFor: z.coerce.number().int().min(0).max(999).default(0),
  votesAgainst: z.coerce.number().int().min(0).max(999).default(0),
  abstentions: z.coerce.number().int().min(0).max(999).default(0),
  outcome: z.enum(["PASSED", "FAILED", "TABLED", "WITHDRAWN"]),
  notes: z.string().max(5000).optional(),
});

async function memberName(committeeId: string, id?: string) {
  if (!id) return null;
  const ms = await db.committeeMembership.findFirst({ where: { committeeId, memberId: id }, include: { member: true } });
  if (!ms) throw new UserError("Selected person is not on this committee.");
  return `${ms.member.firstName} ${ms.member.lastName}`;
}

export async function addMotion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const m = await minutesWithAuth(actor, String(fd.get("minutesId")));
    assertCanEdit(actor, m.status, m.meeting.committeeId);
    const d = motionSchema.parse(formObject(fd));
    const c = m.meeting.committeeId;
    const count = await db.motion.count({ where: { minutesId: m.id } });
    const motion = await db.motion.create({
      data: {
        minutesId: m.id,
        description: d.description,
        movedById: d.movedById ?? null,
        movedByName: (await memberName(c, d.movedById)) ?? d.movedByName ?? null,
        secondedById: d.secondedById ?? null,
        secondedByName: (await memberName(c, d.secondedById)) ?? d.secondedByName ?? null,
        votesFor: d.votesFor,
        votesAgainst: d.votesAgainst,
        abstentions: d.abstentions,
        outcome: d.outcome,
        notes: d.notes ?? null,
        displayOrder: count + 1,
      },
    });
    await audit(actor, { action: "motion.added", entityType: "motion", entityId: motion.id, committeeId: c, details: { minutesId: m.id } });
    if (m.status === "PUBLISHED") await createRevision(actor, m.id, `Motion added: ${d.description.slice(0, 80)}`);
    revalidatePath("/", "layout");
    return { ok: true, message: "Motion recorded." };
  });
}

export async function deleteMotion(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const motion = await db.motion.findUnique({ where: { id: String(fd.get("motionId")) } });
    if (!motion) throw new UserError("Motion not found.");
    const m = await minutesWithAuth(actor, motion.minutesId);
    assertCanEdit(actor, m.status, m.meeting.committeeId);
    await db.motion.delete({ where: { id: motion.id } });
    await audit(actor, { action: "motion.removed", entityType: "motion", entityId: motion.id, committeeId: m.meeting.committeeId, details: { description: motion.description } });
    if (m.status === "PUBLISHED") await createRevision(actor, m.id, `Motion removed: ${motion.description.slice(0, 80)}`);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}
