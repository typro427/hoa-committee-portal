"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, revokeMemberSessions, type AdminActor } from "@/lib/session";
import { audit } from "@/lib/audit";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { generatePin, hashSecret, pinLookup, verifySecret } from "@/lib/crypto";
import { getOrganization } from "@/lib/org";
import { createDefaultFolders } from "./folders";

const ROLE = z.enum(["CHAIR", "SECRETARY", "MEMBER"]);

/** Records must belong to the signed-in administrator's own HOA. */
function ownCommittee(admin: AdminActor, id: string) {
  if (!admin.committeeIds.includes(id)) throw new UserError("Committee not found.");
  return id;
}
async function ownMember(admin: AdminActor, id: string) {
  const m = await db.member.findUnique({ where: { id }, select: { organizationId: true } });
  if (!m || m.organizationId !== admin.organizationId) throw new UserError("Member not found.");
  return id;
}

// ---------------- Committees ----------------

const committeeSchema = z.object({ name: z.string().min(2).max(120), description: z.string().max(2000).optional() });

export async function createCommittee(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const org = await getOrganization();
    const d = committeeSchema.parse(formObject(fd));
    const c = await db.committee.create({ data: { organizationId: org.id, name: d.name, description: d.description ?? null } });
    await createDefaultFolders(c.id);
    await audit(admin, { action: "committee.created", entityType: "committee", entityId: c.id, committeeId: c.id, details: { name: c.name } });
    revalidatePath("/", "layout");
    redirect(`/admin/committees/${c.id}`);
  });
}

export async function updateCommittee(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = ownCommittee(admin, z.string().uuid().parse(fd.get("committeeId")));
    const d = committeeSchema.parse(formObject(fd));
    const before = await db.committee.findUniqueOrThrow({ where: { id } });
    await db.committee.update({ where: { id }, data: { name: d.name, description: d.description ?? null } });
    await audit(admin, { action: "committee.updated", entityType: "committee", entityId: id, committeeId: id, details: { from: before.name, to: d.name } });
    revalidatePath("/", "layout");
    return { ok: true, message: "Committee saved." };
  });
}

export async function setCommitteeStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = ownCommittee(admin, z.string().uuid().parse(fd.get("committeeId")));
    const status = z.enum(["ACTIVE", "ARCHIVED"]).parse(fd.get("status"));
    await db.committee.update({ where: { id }, data: { status } });
    await audit(admin, { action: status === "ARCHIVED" ? "committee.archived" : "committee.reactivated", entityType: "committee", entityId: id, committeeId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: status === "ARCHIVED" ? "Committee archived. Its records are preserved, and members can no longer open it." : "Committee reactivated." };
  });
}

export async function setCommitteeArb(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = ownCommittee(admin, z.string().uuid().parse(fd.get("committeeId")));
    const on = fd.get("handlesArbRequests") === "on";
    await db.committee.update({ where: { id }, data: { handlesArbRequests: on } });
    await audit(admin, { action: on ? "committee.arb_enabled" : "committee.arb_disabled", entityType: "committee", entityId: id, committeeId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: on ? "This committee now receives architectural requests and has an ARB Requests tab." : "This committee no longer receives architectural requests." };
  });
}

// ---------------- Members ----------------

const memberSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email().max(200).optional(),
  phone: z.string().max(40).optional(),
});

async function setPinFor(memberId: string, organizationId: string) {
  // Generate until unique (collisions are astronomically rare but handled).
  for (let i = 0; i < 200; i++) {
    const pin = generatePin();
    const lookup = pinLookup(pin, organizationId);
    if (await db.member.findUnique({ where: { pinLookup: lookup }, select: { id: true } })) continue;
    await db.member.update({ where: { id: memberId }, data: { pinHash: await hashSecret(pin), pinLookup: lookup, pinGeneratedAt: new Date() } });
    await revokeMemberSessions(memberId);
    return pin;
  }
  throw new UserError("Could not generate a unique PIN. Please try again.");
}

async function assignRole(committeeId: string, memberId: string, role: "CHAIR" | "SECRETARY" | "MEMBER", position: string | null, canPublishMinutes: boolean) {
  return db.$transaction(async (tx) => {
    if (role === "CHAIR") {
      // One active chair per committee: demote the current chair to member.
      await tx.committeeMembership.updateMany({ where: { committeeId, role: "CHAIR", isActive: true, NOT: { memberId } }, data: { role: "MEMBER" } });
    }
    return tx.committeeMembership.upsert({
      where: { committeeId_memberId: { committeeId, memberId } },
      create: { committeeId, memberId, role, position, canPublishMinutes: role === "SECRETARY" && canPublishMinutes },
      update: { role, position, canPublishMinutes: role === "SECRETARY" && canPublishMinutes, isActive: true, leftAt: null },
    });
  });
}

export async function createMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const org = await getOrganization();
    const d = memberSchema.extend({
      committeeId: z.string().uuid().optional(),
      role: ROLE.default("MEMBER"),
      position: z.string().max(80).optional(),
      status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
    }).parse(formObject(fd));
    const m = await db.member.create({
      data: { organizationId: org.id, firstName: d.firstName, lastName: d.lastName, email: d.email ?? null, phone: d.phone ?? null, status: d.status },
    });
    if (d.committeeId) await assignRole(ownCommittee(admin, d.committeeId), m.id, d.role, d.position ?? null, false);
    await audit(admin, { action: "member.created", entityType: "member", entityId: m.id, committeeId: d.committeeId ?? null, details: { name: `${m.firstName} ${m.lastName}`, role: d.role } });
    let pin: string | undefined;
    if (fd.get("generatePin") === "on") {
      pin = await setPinFor(m.id, admin.organizationId);
      await audit(admin, { action: "pin.generated", entityType: "member", entityId: m.id });
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Member created.", data: { memberId: m.id, name: `${m.firstName} ${m.lastName}`, ...(pin ? { pin } : {}) } };
  });
}

export async function updateMember(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = await ownMember(admin, z.string().uuid().parse(fd.get("memberId")));
    const d = memberSchema.parse(formObject(fd));
    await db.member.update({ where: { id }, data: { firstName: d.firstName, lastName: d.lastName, email: d.email ?? null, phone: d.phone ?? null } });
    await audit(admin, { action: "member.updated", entityType: "member", entityId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: "Member saved." };
  });
}

export async function setMemberStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = await ownMember(admin, z.string().uuid().parse(fd.get("memberId")));
    const status = z.enum(["ACTIVE", "INACTIVE"]).parse(fd.get("status"));
    await db.member.update({ where: { id }, data: { status } });
    if (status === "INACTIVE") await revokeMemberSessions(id);
    await audit(admin, { action: status === "INACTIVE" ? "member.deactivated" : "member.reactivated", entityType: "member", entityId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: status === "INACTIVE" ? "Member deactivated and signed out everywhere." : "Member reactivated." };
  });
}

export async function revokeSessions(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = await ownMember(admin, z.string().uuid().parse(fd.get("memberId")));
    const { count } = await db.session.deleteMany({ where: { memberId: id } });
    await audit(admin, { action: "member.sessions_revoked", entityType: "member", entityId: id, details: { count } });
    revalidatePath("/", "layout");
    return { ok: true, message: count ? `Signed out of ${count} active session${count === 1 ? "" : "s"}.` : "No active sessions." };
  });
}

export async function saveMembership(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const d = z.object({
      memberId: z.string().uuid(),
      committeeId: z.string().uuid(),
      role: ROLE,
      position: z.string().max(80).optional(),
    }).parse(formObject(fd));
    ownCommittee(admin, d.committeeId);
    await ownMember(admin, d.memberId);
    const prevChair = d.role === "CHAIR"
      ? await db.committeeMembership.findFirst({ where: { committeeId: d.committeeId, role: "CHAIR", isActive: true, NOT: { memberId: d.memberId } }, include: { member: true } })
      : null;
    await assignRole(d.committeeId, d.memberId, d.role, d.position ?? null, fd.get("canPublishMinutes") === "on");
    await audit(admin, { action: "membership.saved", entityType: "member", entityId: d.memberId, committeeId: d.committeeId, details: { role: d.role, canPublishMinutes: fd.get("canPublishMinutes") === "on" } });
    revalidatePath("/", "layout");
    return { ok: true, message: prevChair ? `Saved. ${prevChair.member.firstName} ${prevChair.member.lastName} is no longer chair.` : "Committee assignment saved." };
  });
}

export async function removeMembership(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = z.string().uuid().parse(fd.get("membershipId"));
    const existing = await db.committeeMembership.findUnique({ where: { id }, select: { committeeId: true } });
    if (!existing) throw new UserError("Not found.");
    ownCommittee(admin, existing.committeeId);
    const ms = await db.committeeMembership.update({ where: { id }, data: { isActive: false, leftAt: new Date(), role: "MEMBER", canPublishMinutes: false } });
    await audit(admin, { action: "membership.removed", entityType: "member", entityId: ms.memberId, committeeId: ms.committeeId });
    revalidatePath("/", "layout");
    return { ok: true, message: "Removed from committee. Their past records are preserved." };
  });
}

// ---------------- PINs ----------------

export async function generateMemberPin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = await ownMember(admin, z.string().uuid().parse(fd.get("memberId")));
    const m = await db.member.findUnique({ where: { id }, select: { firstName: true, lastName: true, pinHash: true, status: true } });
    if (!m) throw new UserError("Member not found.");
    const pin = await setPinFor(id, admin.organizationId);
    await audit(admin, { action: m.pinHash ? "pin.reset" : "pin.generated", entityType: "member", entityId: id });
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: m.pinHash ? "New PIN generated. The old PIN no longer works and existing sessions were signed out." : "PIN generated.",
      data: { pin, name: `${m.firstName} ${m.lastName}`, inactive: m.status !== "ACTIVE" },
    };
  });
}

export async function revokeMemberPin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = await ownMember(admin, z.string().uuid().parse(fd.get("memberId")));
    await db.member.update({ where: { id }, data: { pinHash: null, pinLookup: null, pinGeneratedAt: null } });
    await revokeMemberSessions(id);
    await audit(admin, { action: "pin.revoked", entityType: "member", entityId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: "PIN revoked. This member can no longer sign in until a new PIN is generated." };
  });
}

export async function bulkGeneratePins(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const org = await getOrganization();
    const committeeId = fd.get("committeeId") ? ownCommittee(admin, z.string().uuid().parse(fd.get("committeeId"))) : undefined;
    const replaceExisting = fd.get("replaceExisting") === "on";
    const members = await db.member.findMany({
      where: {
        organizationId: org.id, status: "ACTIVE", ...(replaceExisting ? {} : { pinHash: null }),
        ...(committeeId ? { memberships: { some: { committeeId, isActive: true } } } : {}),
      },
      include: { memberships: { where: { isActive: true }, include: { committee: { select: { name: true } } } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    const out: { name: string; committees: string; pin: string }[] = [];
    for (const m of members) {
      const hadPin = !!m.pinHash;
      const pin = await setPinFor(m.id, admin.organizationId);
      out.push({ name: `${m.firstName} ${m.lastName}`, committees: m.memberships.map((x) => x.committee.name).join(", "), pin });
      await audit(admin, { action: hadPin ? "pin.reset" : "pin.generated", entityType: "member", entityId: m.id, details: { bulk: true } });
    }
    revalidatePath("/", "layout");
    return {
      ok: true,
      message: out.length ? `Generated ${out.length} PIN${out.length === 1 ? "" : "s"}.${replaceExisting ? " Old PINs no longer work, and those members were signed out." : ""}` : "Every active member already has a PIN.",
      data: { pins: out },
    };
  });
}

// ---------------- Settings & administrators ----------------

export async function updateSettings(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const org = await getOrganization();
    const d = z.object({
      name: z.string().min(2).max(150),
      tagline: z.string().max(200).optional(),
      logoUrl: z.string().url().max(1000).refine((u) => u.startsWith("https://") || u.startsWith("/"), "Logo URL must start with https://").optional(),
      timezone: z.string().refine((tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } }, "Unknown time zone"),
      sessionTimeoutMinutes: z.coerce.number().int().min(5).max(24 * 60),
    }).parse(formObject(fd));
    await db.organization.update({ where: { id: org.id }, data: { name: d.name, tagline: d.tagline ?? null, logoUrl: d.logoUrl ?? null, timezone: d.timezone, sessionTimeoutMinutes: d.sessionTimeoutMinutes } });
    await audit(admin, { action: "settings.updated", entityType: "organization", entityId: org.id, details: d });
    revalidatePath("/", "layout");
    return { ok: true, message: "Settings saved." };
  });
}

const passwordSchema = z.string().min(12, "Password must be at least 12 characters").max(200);

export async function createAdminUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const d = z.object({ name: z.string().min(2).max(100), email: z.string().trim().toLowerCase().email(), password: passwordSchema }).parse(formObject(fd));
    if (await db.adminUser.findUnique({ where: { organizationId_email: { organizationId: admin.organizationId, email: d.email } } })) throw new UserError("That email is already an administrator here.");
    const a = await db.adminUser.create({ data: { organizationId: admin.organizationId, name: d.name, email: d.email, passwordHash: await hashSecret(d.password) } });
    await audit(admin, { action: "admin.created", entityType: "admin_user", entityId: a.id, details: { email: a.email } });
    revalidatePath("/", "layout");
    return { ok: true, message: `Administrator ${a.email} created.` };
  });
}

export async function setAdminStatus(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const id = z.string().uuid().parse(fd.get("adminId"));
    const status = z.enum(["ACTIVE", "DISABLED"]).parse(fd.get("status"));
    if (id === admin.adminId) throw new UserError("You can't disable your own account.");
    const target = await db.adminUser.findUnique({ where: { id }, select: { organizationId: true } });
    if (!target || target.organizationId !== admin.organizationId) throw new UserError("Administrator not found.");
    if (status === "DISABLED" && (await db.adminUser.count({ where: { organizationId: admin.organizationId, status: "ACTIVE" } })) <= 1) throw new UserError("At least one active administrator is required.");
    await db.adminUser.update({ where: { id }, data: { status } });
    if (status === "DISABLED") await db.session.deleteMany({ where: { adminUserId: id } });
    await audit(admin, { action: status === "DISABLED" ? "admin.disabled" : "admin.enabled", entityType: "admin_user", entityId: id });
    revalidatePath("/", "layout");
    return { ok: true, message: "Administrator updated." };
  });
}

export async function changeOwnPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const admin = await requireAdmin();
    const d = z.object({ current: z.string().min(1), password: passwordSchema, confirm: z.string() }).parse(formObject(fd));
    if (d.password !== d.confirm) throw new UserError("New passwords do not match.");
    const a = await db.adminUser.findUniqueOrThrow({ where: { id: admin.adminId } });
    if (!(await verifySecret(a.passwordHash, d.current))) throw new UserError("Current password is incorrect.");
    await db.adminUser.update({ where: { id: a.id }, data: { passwordHash: await hashSecret(d.password) } });
    await db.session.deleteMany({ where: { adminUserId: a.id, NOT: { id: admin.sessionId } } });
    await audit(admin, { action: "admin.password_changed", entityType: "admin_user", entityId: a.id });
    return { ok: true, message: "Password changed. Other sessions were signed out." };
  });
}
