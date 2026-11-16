"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ArbDocType, ArbStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireActor, clientInfo, type Actor } from "@/lib/session";
import { assert, can } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { runAction, UserError, type ActionResult } from "@/lib/action";
import { consumeQuota } from "@/lib/rate-limit";
import { storeUpload, validateUpload, MAX_UPLOAD_BYTES } from "@/lib/storage";
import { isoToDate } from "@/lib/format";
import { ARB_DECISION_STATUSES, ARB_DOC_TYPES, ARB_STATUS_LABELS, type ArbStatusKey } from "@/lib/arb";
import { arbCommittee, hashArbToken, loadArbByToken, newArbToken, nextReferenceNumber } from "./arb";
import { isUuid } from "./loaders";
import { publicBaseUrl } from "@/lib/url";

const MAX_FILES_PER_REQUEST = 40;
const MAX_TOTAL_SUBMIT_BYTES = 90 * 1024 * 1024;

const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("").transform(() => undefined));
const UTIL = z.enum(["OVERHEAD", "BURIED", "NOT_APPLICABLE", "UNKNOWN"]).default("UNKNOWN");
const requestSchema = z.object({
  applicantName: z.string().trim().min(2, "Enter your name").max(150),
  applicantEmail: z.string().trim().email("Enter a valid email").max(200).optional().or(z.literal("").transform(() => undefined)),
  applicantPhone: opt(40),
  propertyAddress: z.string().trim().min(3, "Enter the property address").max(300),
  lotNumber: opt(40),
  projectType: z.enum(["NEW_CONSTRUCTION", "ADDITION", "DECK_OR_PATIO", "FENCE", "POOL_OR_SPA", "SHED_OR_ACCESSORY", "DRIVEWAY", "ROOF", "EXTERIOR_PAINT", "LANDSCAPING", "SOLAR", "OTHER"], { message: "Choose the type of project" }),
  description: z.string().trim().min(10, "Describe the project (at least a sentence)").max(10000),
  contractorName: opt(200),
  estimatedStart: date,
  estimatedFinish: date,
  waterLine: UTIL,
  gasLine: UTIL,
  electricLine: UTIL,
  utilityNotes: opt(2000),
});

function files(fd: FormData, name: string) {
  return fd.getAll(name).filter((f): f is File => f instanceof File && f.size > 0);
}

async function saveArbFile(file: File, opts: { requestId: string; committeeId: string; organizationId: string; docType: ArbDocType; actor?: Actor; residentName?: string }) {
  const stored = await storeUpload(file, { organizationId: opts.organizationId, committeeId: opts.committeeId });
  return db.document.create({
    data: {
      committeeId: opts.committeeId,
      arbRequestId: opts.requestId,
      arbDocType: opts.docType,
      title: `${ARB_DOC_TYPES[opts.docType].label} — ${stored.originalFilename}`.slice(0, 200),
      ...stored,
      uploadedByMemberId: opts.actor?.kind === "member" ? opts.actor.memberId : null,
      uploadedByAdminId: opts.actor?.kind === "admin" ? opts.actor.adminId : null,
      uploadedByResident: opts.residentName ?? null,
    },
  });
}

async function createRequest(fd: FormData, staff: Actor | null) {
  const committee = await arbCommittee();
  if (!committee) throw new UserError("Architectural requests aren't being accepted online right now. Please contact the HOA.");
  if (staff) assert(can.manageArb(staff, committee.id), "Only the ARB chair, secretary, or an administrator can enter requests.");
  const d = requestSchema.parse(Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string")));

  const uploads: { file: File; type: ArbDocType }[] = [
    ...files(fd, "platPlan").map((f) => ({ file: f, type: "PLAT_PLAN" as const })),
    ...files(fd, "elevations").map((f) => ({ file: f, type: "ELEVATIONS" as const })),
    ...files(fd, "utilities").map((f) => ({ file: f, type: "UTILITY_LOCATIONS" as const })),
    ...files(fd, "other").map((f) => ({ file: f, type: "OTHER" as const })),
  ];
  if (uploads.length > 20) throw new UserError("Please upload 20 files or fewer at once. You can add more later from your tracking page.");
  const total = uploads.reduce((a, u) => a + u.file.size, 0);
  if (total > MAX_TOTAL_SUBMIT_BYTES) throw new UserError("The files together are too large (90 MB maximum). Upload the rest later from your tracking page.");
  for (const u of uploads) validateUpload(u.file); // fail fast before anything is saved

  const token = newArbToken();
  let request = null;
  for (let attempt = 0; attempt < 5 && !request; attempt++) {
    try {
      request = await db.arbRequest.create({
        data: {
          committeeId: committee.id,
          referenceNumber: await nextReferenceNumber(committee.organization.timezone),
          applicantName: d.applicantName,
          applicantEmail: d.applicantEmail ?? null,
          applicantPhone: d.applicantPhone ?? null,
          propertyAddress: d.propertyAddress,
          lotNumber: d.lotNumber ?? null,
          projectType: d.projectType,
          description: d.description,
          contractorName: d.contractorName ?? null,
          estimatedStart: d.estimatedStart ? isoToDate(d.estimatedStart) : null,
          estimatedFinish: d.estimatedFinish ? isoToDate(d.estimatedFinish) : null,
          waterLine: d.waterLine,
          gasLine: d.gasLine,
          electricLine: d.electricLine,
          utilityNotes: d.utilityNotes ?? null,
          accessTokenHash: hashArbToken(token),
          submittedByStaff: staff ? staff.name : null,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e; // reference number race: retry
    }
  }
  if (!request) throw new UserError("Couldn't save the request. Please try again.");
  for (const u of uploads) {
    await saveArbFile(u.file, { requestId: request.id, committeeId: committee.id, organizationId: committee.organizationId, docType: u.type, actor: staff ?? undefined, residentName: staff ? undefined : d.applicantName });
  }
  await db.arbRequestEvent.create({
    data: {
      requestId: request.id, kind: "RESIDENT", toStatus: "SUBMITTED", visibleToResident: true,
      message: staff ? `Request entered by ${staff.name} on behalf of ${d.applicantName}.` : `Request submitted with ${uploads.length} file${uploads.length === 1 ? "" : "s"}.`,
      actorName: staff ? staff.name : d.applicantName,
      actorMemberId: staff?.kind === "member" ? staff.memberId : null,
      actorAdminId: staff?.kind === "admin" ? staff.adminId : null,
    },
  });
  await db.auditLog.create({
    data: {
      organizationId: committee.organizationId,
      actorMemberId: staff?.kind === "member" ? staff.memberId : null,
      actorAdminId: staff?.kind === "admin" ? staff.adminId : null,
      actorName: staff ? staff.name : `${d.applicantName} (resident)`,
      committeeId: committee.id,
      action: "arb.submitted",
      entityType: "arb_request",
      entityId: request.id,
      detailsJson: { reference: request.referenceNumber, files: uploads.length, address: d.propertyAddress },
    },
  });
  return { request, token };
}

// ---------------- Public: residents ----------------

export async function submitArbRequest(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    if (String(fd.get("website") ?? "") !== "") throw new UserError("Something went wrong. Please try again."); // bot honeypot
    const { ip } = await clientInfo();
    if (!(await consumeQuota(`arb:submit:ip:${ip}`, 5, 60))) throw new UserError("Too many requests from this device. Please wait an hour and try again.");
    const { token } = await createRequest(fd, null);
    revalidatePath("/", "layout");
    redirect(`/arb/r/${token}?new=1`);
  });
}

async function residentRequest(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const r = await loadArbByToken(token);
  if (!r) throw new UserError("This link is no longer valid. Contact the HOA for a new one.");
  const { ip } = await clientInfo();
  if (!(await consumeQuota(`arb:resident:${r.id}`, 30, 60)) || !(await consumeQuota(`arb:resident:ip:${ip}`, 60, 60))) {
    throw new UserError("Too many changes in a short time. Please wait a while and try again.");
  }
  return { r, token };
}

const RESIDENT_DOC = z.enum(["PLAT_PLAN", "ELEVATIONS", "UTILITY_LOCATIONS", "BUILDING_PERMIT", "OTHER"]);

export async function residentUpload(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { r } = await residentRequest(fd);
    if (r.status === "COMPLETED" || r.status === "DENIED") throw new UserError("This request is closed. Contact the HOA if you need to add something.");
    const docType = RESIDENT_DOC.parse(fd.get("docType"));
    const list = files(fd, "file");
    if (list.length === 0) throw new UserError("Choose a file to upload.");
    if (r.documents.length + list.length > MAX_FILES_PER_REQUEST) throw new UserError("This request already has the maximum number of files. Contact the HOA.");
    if (list.reduce((a, f) => a + f.size, 0) > MAX_UPLOAD_BYTES * 3) throw new UserError("Those files are too large together. Upload them one at a time.");
    for (const f of list) validateUpload(f);
    const org = (await db.committee.findUniqueOrThrow({ where: { id: r.committeeId }, select: { organizationId: true } })).organizationId;
    for (const f of list) await saveArbFile(f, { requestId: r.id, committeeId: r.committeeId, organizationId: org, docType, residentName: r.applicantName });
    const label = ARB_DOC_TYPES[docType].label.toLowerCase();
    let newStatus: ArbStatus | null = null;
    if (r.status === "MORE_INFO_NEEDED") newStatus = "UNDER_REVIEW"; // the resident has answered the board's request
    await db.$transaction([
      db.arbRequestEvent.create({
        data: {
          requestId: r.id, kind: "DOCUMENT", visibleToResident: true, actorName: r.applicantName,
          message: `Uploaded ${list.length > 1 ? `${list.length} files` : "a file"} (${label}).`,
          ...(newStatus ? { fromStatus: r.status, toStatus: newStatus } : {}),
        },
      }),
      ...(newStatus ? [db.arbRequest.update({ where: { id: r.id }, data: { status: newStatus } })] : []),
    ]);
    await db.auditLog.create({ data: { organizationId: org, actorName: `${r.applicantName} (resident)`, committeeId: r.committeeId, action: "arb.resident_uploaded", entityType: "arb_request", entityId: r.id, detailsJson: { docType, files: list.length } } });
    revalidatePath("/", "layout");
    return { ok: true, message: docType === "BUILDING_PERMIT" ? "Building permit uploaded. The board will review it and close your request." : "Uploaded. Thank you!" };
  });
}

export async function residentMessage(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { r } = await residentRequest(fd);
    const message = z.string().trim().min(2, "Write a message").max(5000).parse(fd.get("message"));
    const reopen = r.status === "MORE_INFO_NEEDED";
    await db.$transaction([
      db.arbRequestEvent.create({
        data: { requestId: r.id, kind: "RESIDENT", message, visibleToResident: true, actorName: r.applicantName, ...(reopen ? { fromStatus: r.status, toStatus: "UNDER_REVIEW" } : {}) },
      }),
      ...(reopen ? [db.arbRequest.update({ where: { id: r.id }, data: { status: "UNDER_REVIEW" } })] : []),
    ]);
    revalidatePath("/", "layout");
    return { ok: true, message: "Message sent to the Architectural Review Board." };
  });
}

/** Resident reports progress: construction started, or construction finished. */
export async function residentProgress(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { r, token } = await residentRequest(fd);
    const step = z.enum(["started", "finished"]).parse(fd.get("step"));
    const approved = r.status === "APPROVED" || r.status === "APPROVED_WITH_CONDITIONS";
    let to: ArbStatus;
    if (step === "started" && approved) to = "CONSTRUCTION_IN_PROGRESS";
    else if (step === "finished" && (approved || r.status === "CONSTRUCTION_IN_PROGRESS")) to = "AWAITING_BUILDING_PERMIT";
    else throw new UserError("That update isn't available at this stage.");
    const hasPermit = r.documents.some((d) => d.arbDocType === "BUILDING_PERMIT");
    await db.$transaction([
      db.arbRequest.update({ where: { id: r.id }, data: { status: to } }),
      db.arbRequestEvent.create({
        data: {
          requestId: r.id, kind: "STATUS_CHANGE", fromStatus: r.status, toStatus: to, visibleToResident: true, actorName: r.applicantName,
          message: step === "started" ? "Resident reported that construction has started." : `Resident reported that construction is finished.${hasPermit ? " Building permit already uploaded." : ""}`,
        },
      }),
    ]);
    revalidatePath("/", "layout");
    // The button disappears once the stage changes, so confirm with a banner instead of an inline message.
    redirect(`/arb/r/${token}?progress=${step}`);
  });
}

// ---------------- Committee (ARB members / admin) ----------------

async function requestForStaff(actor: Actor, id: string, manage = false) {
  if (!isUuid(id)) throw new UserError("Request not found.");
  const r = await db.arbRequest.findUnique({ where: { id }, include: { documents: { where: { removedAt: null }, select: { arbDocType: true } } } });
  if (!r) throw new UserError("Request not found.");
  assert(manage ? can.manageArb(actor, r.committeeId) : can.viewArb(actor, r.committeeId), manage ? "Only the ARB chair, secretary, or an administrator can do that." : undefined);
  return r;
}

const STATUS = z.enum(Object.keys(ARB_STATUS_LABELS) as [ArbStatusKey, ...ArbStatusKey[]]);

export async function updateArbStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const r = await requestForStaff(actor, String(fd.get("requestId")), true);
    const to = STATUS.parse(fd.get("status"));
    const message = String(fd.get("message") ?? "").trim().slice(0, 5000) || null;
    const note = String(fd.get("note") ?? "").trim().slice(0, 5000) || null;
    const decision = String(fd.get("decisionNotes") ?? "").trim().slice(0, 10000) || null;
    if (to === r.status && !message && !note && !decision) throw new UserError("Choose a new stage or write a message.");
    if (to === "APPROVED_WITH_CONDITIONS" && !decision && !r.decisionNotes) throw new UserError("List the conditions of approval for the resident.");
    if (to === "DENIED" && !decision && !r.decisionNotes) throw new UserError("Explain why the request is denied.");
    if (to === "MORE_INFO_NEEDED" && !message) throw new UserError("Tell the resident what information or documents you need.");
    if (to === "COMPLETED" && !r.documents.some((d) => d.arbDocType === "BUILDING_PERMIT") && fd.get("permitWaived") !== "on") {
      throw new UserError("No building permit has been uploaded. Upload it, or check “No permit required” to close anyway.");
    }
    const isDecision = ARB_DECISION_STATUSES.includes(to) && to !== r.status;
    const actorIds = { actorName: actor.name, actorMemberId: actor.kind === "member" ? actor.memberId : null, actorAdminId: actor.kind === "admin" ? actor.adminId : null };
    await db.$transaction([
      db.arbRequest.update({
        where: { id: r.id },
        data: {
          status: to,
          ...(decision ? { decisionNotes: decision } : {}),
          ...(isDecision ? { decidedAt: new Date(), decidedByName: actor.name } : {}),
          ...(to === "COMPLETED" ? { completedAt: new Date() } : r.status === "COMPLETED" ? { completedAt: null } : {}),
        },
      }),
      ...(to !== r.status || message || decision
        ? [db.arbRequestEvent.create({
            data: {
              requestId: r.id, kind: to !== r.status ? "STATUS_CHANGE" : "MESSAGE", visibleToResident: true,
              ...(to !== r.status ? { fromStatus: r.status, toStatus: to } : {}),
              message: [message, decision && to !== r.status ? (to === "DENIED" ? `Reason: ${decision}` : to === "APPROVED_WITH_CONDITIONS" ? `Conditions: ${decision}` : decision) : null].filter(Boolean).join("\n\n") || null,
              ...actorIds,
            },
          })]
        : []),
      ...(note ? [db.arbRequestEvent.create({ data: { requestId: r.id, kind: "NOTE", message: note, visibleToResident: false, ...actorIds } })] : []),
    ]);
    await audit(actor, { action: "arb.status_changed", entityType: "arb_request", entityId: r.id, committeeId: r.committeeId, details: { from: r.status, to, reference: r.referenceNumber } });
    revalidatePath("/", "layout");
    return { ok: true, message: to !== r.status ? `Moved to “${ARB_STATUS_LABELS[to]}”. The resident can see this on their tracking page.` : "Saved." };
  });
}

export async function addArbNote(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const toResident = fd.get("toResident") === "on";
    const r = await requestForStaff(actor, String(fd.get("requestId")), toResident);
    const message = z.string().trim().min(2, "Write a note").max(5000).parse(fd.get("message"));
    await db.arbRequestEvent.create({
      data: {
        requestId: r.id, kind: toResident ? "MESSAGE" : "NOTE", message, visibleToResident: toResident,
        actorName: actor.name, actorMemberId: actor.kind === "member" ? actor.memberId : null, actorAdminId: actor.kind === "admin" ? actor.adminId : null,
      },
    });
    await audit(actor, { action: toResident ? "arb.message_sent" : "arb.note_added", entityType: "arb_request", entityId: r.id, committeeId: r.committeeId });
    revalidatePath("/", "layout");
    return { ok: true, message: toResident ? "Message posted to the resident's tracking page." : "Internal note added (not visible to the resident)." };
  });
}

export async function staffArbUpload(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const r = await requestForStaff(actor, String(fd.get("requestId")), true);
    const docType = RESIDENT_DOC.parse(fd.get("docType"));
    const list = files(fd, "file");
    if (!list.length) throw new UserError("Choose a file to upload.");
    for (const f of list) validateUpload(f);
    const org = (await db.committee.findUniqueOrThrow({ where: { id: r.committeeId }, select: { organizationId: true } })).organizationId;
    for (const f of list) await saveArbFile(f, { requestId: r.id, committeeId: r.committeeId, organizationId: org, docType, actor });
    await db.arbRequestEvent.create({
      data: { requestId: r.id, kind: "DOCUMENT", visibleToResident: true, message: `${actor.name} added ${list.length > 1 ? `${list.length} files` : "a file"} (${ARB_DOC_TYPES[docType].label.toLowerCase()}).`, actorName: actor.name, actorMemberId: actor.kind === "member" ? actor.memberId : null, actorAdminId: actor.kind === "admin" ? actor.adminId : null },
    });
    await audit(actor, { action: "arb.document_uploaded", entityType: "arb_request", entityId: r.id, committeeId: r.committeeId, details: { docType, files: list.length } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Uploaded." };
  });
}

/** Issues a new private link (the old one stops working). The link is shown once to the ARB member. */
export async function resetArbLink(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const r = await requestForStaff(actor, String(fd.get("requestId")), true);
    const token = newArbToken();
    await db.arbRequest.update({ where: { id: r.id }, data: { accessTokenHash: hashArbToken(token) } });
    await audit(actor, { action: "arb.link_reset", entityType: "arb_request", entityId: r.id, committeeId: r.committeeId });
    const base = await publicBaseUrl();
    return { ok: true, message: "New resident link created. The previous link no longer works.", data: { link: `${base}/arb/r/${token}` } };
  });
}

/** ARB member enters a paper / emailed request on a resident's behalf. */
export async function staffCreateArbRequest(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const actor = await requireActor(fd.get("scope") as string);
    const { request } = await createRequest(fd, actor);
    revalidatePath("/", "layout");
    redirect(`${actor.kind === "admin" ? "/admin" : "/portal"}/arb/${request.id}?created=1`);
  });
}
