"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { dummyVerify, hashSecret, legacyPinLookup, pinLookup, safeEqual, verifySecret } from "@/lib/crypto";
import { checkLockout, recordAttempt } from "@/lib/rate-limit";
import {
  clientInfo, createAdminSession, createMemberSession, destroySession, getAdminContext,
  getMemberContext, setActiveCommittee,
} from "@/lib/session";
import { audit } from "@/lib/audit";
import { getOrganization, getOrganizationSafe, orgAccess } from "@/lib/org";
import { runAction, type ActionResult, UserError } from "@/lib/action";

const GENERIC_PIN_ERROR = "That PIN wasn't recognized. Please check it and try again.";

export async function loginWithPin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const pin = String(fd.get("pin") ?? "").replace(/\D/g, "");
  const org = await getOrganizationSafe();
  if (!org) return { ok: false, error: "This HOA address wasn't found. Check the link you were given." };
  if (!orgAccess(org).active) return { ok: false, error: "This HOA's portal is currently unavailable. Please contact your HOA administrator." };
  const { ip } = await clientInfo();
  const keys = [`pin:ip:${ip}`];
  const globalKey = `pin:global:${org.id}`; // the system-wide brake is per HOA, so one HOA can't lock out another

  const lock = await checkLockout(keys, { global: globalKey });
  if (lock.locked) return { ok: false, error: lock.message };

  if (pin.length < 4 || pin.length > 12) {
    await recordAttempt([...keys, globalKey], false);
    return { ok: false, error: GENERIC_PIN_ERROR };
  }

  const select = {
      id: true, organizationId: true, firstName: true, lastName: true, status: true, pinHash: true,
      memberships: {
        where: { isActive: true, committee: { status: "ACTIVE" } },
        select: { committeeId: true },
      },
  } as const;
  // PINs are keyed to the HOA. (PINs issued before multi-HOA support use the older key, still limited to this HOA.)
  let member = await db.member.findUnique({ where: { pinLookup: pinLookup(pin, org.id) }, select });
  if (!member) {
    const legacy = await db.member.findUnique({ where: { pinLookup: legacyPinLookup(pin) }, select });
    if (legacy?.organizationId === org.id) member = legacy;
  }

  const valid = member?.pinHash ? await verifySecret(member.pinHash, pin) : (await dummyVerify(pin), false);
  if (!member || !valid) {
    await recordAttempt([...keys, globalKey], false);
    return { ok: false, error: GENERIC_PIN_ERROR };
  }
  if (member.status !== "ACTIVE") {
    await recordAttempt(keys, false);
    return { ok: false, error: "This account is inactive. Please contact your HOA administrator." };
  }
  if (member.memberships.length === 0) {
    return { ok: false, error: "You are not currently assigned to a committee. Please contact your HOA administrator." };
  }

  await recordAttempt(keys, true);
  const single = member.memberships.length === 1 ? member.memberships[0].committeeId : null;
  await createMemberSession(member.id, single);
  await db.member.update({ where: { id: member.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({
    data: {
      organizationId: member.organizationId,
      actorMemberId: member.id,
      actorName: `${member.firstName} ${member.lastName}`,
      committeeId: single,
      action: "member.login",
      entityType: "member",
      entityId: member.id,
      detailsJson: { ip },
    },
  });
  redirect(single ? "/portal" : "/portal/select");
}

export async function logoutMember() {
  await destroySession("member");
  redirect("/login");
}

export async function selectCommittee(fd: FormData) {
  const id = String(fd.get("committeeId") ?? "");
  await setActiveCommittee(id);
  redirect("/portal");
}

export async function switchCommittee() {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/login");
  redirect("/portal/select");
}

// ---------------- Administrator ----------------

const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function adminLogin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const parsed = adminLoginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: "Enter your email address and password." };
  const { email, password } = parsed.data;
  const org = await getOrganizationSafe();
  if (!org) return { ok: false, error: "This HOA address wasn't found." };
  const { ip } = await clientInfo();
  const keys = [`admin:ip:${ip}`, `admin:email:${org.id}:${email}`];

  const lock = await checkLockout(keys);
  if (lock.locked) return { ok: false, error: lock.message };

  const admin = await db.adminUser.findUnique({ where: { organizationId_email: { organizationId: org.id, email } } });
  const valid = admin ? await verifySecret(admin.passwordHash, password) : (await dummyVerify(password), false);
  if (!admin || !valid || admin.status !== "ACTIVE") {
    await recordAttempt(keys, false);
    return { ok: false, error: "Invalid email or password." };
  }
  await recordAttempt(keys, true);
  await createAdminSession(admin.id);
  await db.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  await db.auditLog.create({
    data: {
      organizationId: org.id, actorAdminId: admin.id, actorName: `${admin.name} (Admin)`,
      action: "admin.login", entityType: "admin_user", entityId: admin.id, detailsJson: { ip },
    },
  });
  redirect("/admin");
}

export async function adminLogout() {
  await destroySession("admin");
  redirect("/admin/login");
}

const setupSchema = z.object({
  token: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12, "Password must be at least 12 characters").max(200),
  confirm: z.string(),
});

/** First-run administrator creation, protected by SETUP_TOKEN and only while no admin exists. */
export async function setupFirstAdmin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const data = setupSchema.parse(Object.fromEntries(fd));
    const expected = process.env.SETUP_TOKEN;
    if (!expected || !safeEqual(data.token, expected)) throw new UserError("Invalid setup token.");
    if (data.password !== data.confirm) throw new UserError("Passwords do not match.");
    const org = await getOrganization();
    if ((await db.adminUser.count({ where: { organizationId: org.id } })) > 0) throw new UserError("An administrator already exists. Use the admin sign-in page.");
    const admin = await db.adminUser.create({
      data: { organizationId: org.id, name: data.name, email: data.email, passwordHash: await hashSecret(data.password) },
    });
    await audit(null, { action: "admin.created_initial", entityType: "admin_user", entityId: admin.id, details: { email: admin.email } }, org.id);
    await createAdminSession(admin.id);
    redirect("/admin");
  });
}

export async function alreadySignedInRedirect() {
  if (await getAdminContext()) redirect("/admin");
}
