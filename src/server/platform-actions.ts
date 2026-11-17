"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { dummyVerify, hashSecret, safeEqual, verifySecret } from "@/lib/crypto";
import { checkLockout, recordAttempt } from "@/lib/rate-limit";
import { clientInfo, createPlatformSession, destroySession, requirePlatform, type PlatformActor } from "@/lib/session";
import { formObject, runAction, UserError, type ActionResult } from "@/lib/action";
import { DEFAULT_FOLDERS } from "@/lib/format";
import { getTenant, hoaUrl, isValidSlug, rootDomain } from "@/lib/tenant";

/** Owner console is only served on the main site (or anywhere in single-HOA mode). */
async function assertPlatformSite() {
  const t = await getTenant();
  if (rootDomain() && t.kind !== "platform") throw new UserError("The owner console is only available on the main site.");
}

async function ownerAudit(owner: PlatformActor, organizationId: string, action: string, details?: Record<string, unknown>) {
  await db.auditLog.create({
    data: { organizationId, actorName: `${owner.name} (Platform owner)`, action, entityType: "organization", entityId: organizationId, detailsJson: (details ?? undefined) as never },
  });
}

// ---------------- Sign-in ----------------

export async function platformLogin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await assertPlatformSite().catch(() => redirect("/"));
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { ok: false, error: "Enter your email address and password." };
  const { ip } = await clientInfo();
  const keys = [`platform:ip:${ip}`, `platform:email:${email}`];
  const lock = await checkLockout(keys);
  if (lock.locked) return { ok: false, error: lock.message };
  const u = await db.platformUser.findUnique({ where: { email } });
  const valid = u ? await verifySecret(u.passwordHash, password) : (await dummyVerify(password), false);
  if (!u || !valid || u.status !== "ACTIVE") {
    await recordAttempt(keys, false);
    return { ok: false, error: "Invalid email or password." };
  }
  await recordAttempt(keys, true);
  await createPlatformSession(u.id);
  await db.platformUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
  redirect("/platform");
}

export async function platformLogout() {
  await destroySession("platform");
  redirect("/platform/login");
}

export async function setupFirstOwner(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPlatformSite();
    const d = z.object({
      token: z.string().min(1),
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(14, "Owner passwords must be at least 14 characters").max(200),
      confirm: z.string(),
    }).parse(Object.fromEntries(fd));
    const expected = process.env.SETUP_TOKEN;
    if (!expected || !safeEqual(d.token, expected)) throw new UserError("Invalid setup token.");
    if (d.password !== d.confirm) throw new UserError("Passwords do not match.");
    if ((await db.platformUser.count()) > 0) throw new UserError("An owner account already exists. Sign in instead.");
    const u = await db.platformUser.create({ data: { name: d.name, email: d.email, passwordHash: await hashSecret(d.password) } });
    await createPlatformSession(u.id);
    redirect("/platform");
  });
}

// ---------------- HOAs ----------------

const slugSchema = z.string().trim().toLowerCase().refine(isValidSlug, "Use 2–42 lowercase letters, numbers, or dashes (some words like 'www' are reserved)");
const tz = z.string().refine((t) => { try { new Intl.DateTimeFormat("en-US", { timeZone: t }); return true; } catch { return false; } }, "Unknown time zone");

const STARTER_COMMITTEES = [
  { name: "Architectural Review Board", description: "Reviews homeowner architectural modification requests.", handlesArbRequests: true },
  { name: "Safety and Security Committee", description: "Community safety, security, lighting, and emergency preparedness.", handlesArbRequests: false },
  { name: "Special Events Committee", description: "Plans and runs community events and socials.", handlesArbRequests: false },
];

export async function createHoa(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPlatformSite();
    const owner = await requirePlatform();
    const d = z.object({
      name: z.string().trim().min(2).max(150),
      slug: slugSchema,
      timezone: tz.default("America/New_York"),
      status: z.enum(["TRIAL", "ACTIVE"]),
      trialDays: z.coerce.number().int().min(1).max(365).default(30),
      contactName: z.string().trim().max(150).optional(),
      contactEmail: z.string().trim().email().max(200).optional(),
      adminName: z.string().trim().min(2).max(100),
      adminEmail: z.string().trim().toLowerCase().email(),
      adminPassword: z.string().min(12, "The first admin's temporary password must be at least 12 characters").max(200),
    }).parse(formObject(fd));
    if (await db.organization.findUnique({ where: { slug: d.slug } })) throw new UserError(`The address “${d.slug}” is already taken.`);
    const starter = fd.get("starterCommittees") === "on";
    const org = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: d.name, slug: d.slug, timezone: d.timezone, status: d.status,
          trialEndsAt: d.status === "TRIAL" ? new Date(Date.now() + d.trialDays * 86400_000) : null,
          contactName: d.contactName ?? d.adminName, contactEmail: d.contactEmail ?? d.adminEmail,
        },
      });
      await tx.adminUser.create({ data: { organizationId: org.id, name: d.adminName, email: d.adminEmail, passwordHash: await hashSecret(d.adminPassword) } });
      if (starter) {
        for (const c of STARTER_COMMITTEES) {
          const committee = await tx.committee.create({ data: { organizationId: org.id, ...c } });
          await tx.documentFolder.createMany({ data: DEFAULT_FOLDERS.map((name, i) => ({ committeeId: committee.id, name, displayOrder: (i + 1) * 10 })) });
        }
      }
      return org;
    });
    await ownerAudit(owner, org.id, "platform.hoa_created", { slug: org.slug, status: org.status, starterCommittees: starter });
    revalidatePath("/platform", "layout");
    redirect(`/platform/hoas/${org.id}?created=1`);
  });
}

async function ownedOrg(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new UserError("HOA not found.");
  const org = await db.organization.findUnique({ where: { id } });
  if (!org) throw new UserError("HOA not found.");
  return org;
}

export async function updateHoa(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPlatformSite();
    const owner = await requirePlatform();
    const org = await ownedOrg(String(fd.get("orgId")));
    const d = z.object({
      name: z.string().trim().min(2).max(150),
      slug: slugSchema,
      status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]),
      trialEndsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      contactName: z.string().trim().max(150).optional(),
      contactEmail: z.string().trim().email().max(200).optional(),
      ownerNotes: z.string().max(10000).optional(),
    }).parse(formObject(fd));
    if (d.slug !== org.slug && (await db.organization.findUnique({ where: { slug: d.slug } }))) throw new UserError(`The address “${d.slug}” is already taken.`);
    await db.organization.update({
      where: { id: org.id },
      data: {
        name: d.name, slug: d.slug, status: d.status,
        trialEndsAt: d.trialEndsAt ? new Date(`${d.trialEndsAt}T23:59:59Z`) : d.status === "TRIAL" ? org.trialEndsAt : null,
        contactName: d.contactName ?? null, contactEmail: d.contactEmail ?? null, ownerNotes: d.ownerNotes ?? null,
      },
    });
    if (d.status === "SUSPENDED" || d.status === "CANCELLED") {
      // Sign everyone in this HOA out right away.
      await db.session.deleteMany({ where: { OR: [{ member: { organizationId: org.id } }, { adminUser: { organizationId: org.id } }] } });
    }
    await ownerAudit(owner, org.id, "platform.hoa_updated", { from: { slug: org.slug, status: org.status }, to: { slug: d.slug, status: d.status } });
    revalidatePath("/platform", "layout");
    return { ok: true, message: d.slug !== org.slug ? `Saved. The HOA's new address is ${hoaUrl(d.slug)}. The old address no longer works.` : "Saved." };
  });
}

export async function setHoaAdmin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertPlatformSite();
    const owner = await requirePlatform();
    const org = await ownedOrg(String(fd.get("orgId")));
    const d = z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(12, "Temporary passwords must be at least 12 characters").max(200),
    }).parse(formObject(fd));
    const key = { organizationId_email: { organizationId: org.id, email: d.email } };
    const existing = await db.adminUser.findUnique({ where: key });
    if (existing) {
      await db.adminUser.update({ where: key, data: { passwordHash: await hashSecret(d.password), status: "ACTIVE" } });
      await db.session.deleteMany({ where: { adminUserId: existing.id } });
    } else {
      await db.adminUser.create({ data: { organizationId: org.id, name: d.name, email: d.email, passwordHash: await hashSecret(d.password) } });
    }
    await ownerAudit(owner, org.id, existing ? "platform.admin_password_reset" : "platform.admin_added", { email: d.email });
    revalidatePath("/platform", "layout");
    return { ok: true, message: existing ? `Password reset for ${d.email}. Send them the new temporary password.` : `Administrator ${d.email} added.` };
  });
}

// ---------------- Public: find your HOA ----------------

export async function findHoa(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const q = String(fd.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return { ok: false, error: "Enter your HOA's name or web address." };
  const slug = q.replace(/^https?:\/\//, "").split(".")[0].replace(/[^a-z0-9-]/g, "");
  const org =
    (await db.organization.findUnique({ where: { slug }, select: { slug: true } })) ??
    (await db.organization.findFirst({ where: { name: { equals: q, mode: "insensitive" } }, select: { slug: true } }));
  if (!org) return { ok: false, error: "We couldn't find that HOA. Check the link your HOA sent you, or ask your HOA administrator." };
  redirect(`${hoaUrl(org.slug)}/login`);
}
