import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { CommitteeRole } from "@prisma/client";
import { db } from "./db";
import { env } from "./env";
import { hashSessionToken, newSessionToken } from "./crypto";
import { getOrganization, getOrganizationSafe, orgAccess } from "./org";

export const MEMBER_COOKIE = "hoa_member_session";
export const ADMIN_COOKIE = "hoa_admin_session";
export const PLATFORM_COOKIE = "hoa_platform_session";
type Kind = "member" | "admin" | "platform";
const COOKIE: Record<Kind, string> = { member: MEMBER_COOKIE, admin: ADMIN_COOKIE, platform: PLATFORM_COOKIE };
const PLATFORM_IDLE_MS = 60 * 60 * 1000;
const ABSOLUTE_MAX_MS = 7 * 24 * 60 * 60 * 1000; // hard cap on any session
const TOUCH_INTERVAL_MS = 60 * 1000;

export async function clientInfo() {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0] : h.get("x-real-ip"))?.trim() || "unknown";
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

async function idleTimeoutMs(kind: Kind = "member") {
  if (kind === "platform") return PLATFORM_IDLE_MS;
  const org = await getOrganization();
  return Math.max(5, org.sessionTimeoutMinutes) * 60 * 1000;
}

async function setCookie(name: string, token: string) {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    maxAge: ABSOLUTE_MAX_MS / 1000,
  });
}

export async function createMemberSession(memberId: string, activeCommitteeId: string | null) {
  const token = newSessionToken();
  const { ip, userAgent } = await clientInfo();
  await db.session.create({
    data: {
      memberId,
      activeCommitteeId,
      tokenHash: hashSessionToken(token, "member"),
      expiresAt: new Date(Date.now() + (await idleTimeoutMs())),
      ipAddress: ip,
      userAgent,
    },
  });
  await setCookie(MEMBER_COOKIE, token);
}

export async function createAdminSession(adminUserId: string) {
  const token = newSessionToken();
  const { ip, userAgent } = await clientInfo();
  await db.session.create({
    data: {
      adminUserId,
      tokenHash: hashSessionToken(token, "admin"),
      expiresAt: new Date(Date.now() + (await idleTimeoutMs())),
      ipAddress: ip,
      userAgent,
    },
  });
  await setCookie(ADMIN_COOKIE, token);
}

export async function createPlatformSession(platformUserId: string) {
  const token = newSessionToken();
  const { ip, userAgent } = await clientInfo();
  await db.session.create({
    data: { platformUserId, tokenHash: hashSessionToken(token, "platform"), expiresAt: new Date(Date.now() + PLATFORM_IDLE_MS), ipAddress: ip, userAgent },
  });
  await setCookie(PLATFORM_COOKIE, token);
}

export async function destroySession(kind: Kind) {
  const jar = await cookies();
  const name = COOKIE[kind];
  const token = jar.get(name)?.value;
  if (token) {
    await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token, kind) } });
  }
  jar.delete(name);
}

async function loadSession(kind: Kind) {
  const token = (await cookies()).get(COOKIE[kind])?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashSessionToken(token, kind) } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() < now || now - session.createdAt.getTime() > ABSOLUTE_MAX_MS) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Sliding idle expiration.
  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(), expiresAt: new Date(now + (await idleTimeoutMs(kind))) },
      })
      .catch(() => {});
  }
  return session;
}

// ---------------- Member context ----------------

export type MembershipInfo = {
  membershipId: string;
  committeeId: string;
  committeeName: string;
  role: CommitteeRole;
  canPublishMinutes: boolean;
  position: string | null;
};

export type MemberActor = {
  kind: "member";
  sessionId: string;
  memberId: string;
  name: string;
  organizationId: string;
  committeeId: string;
  committeeName: string;
  role: CommitteeRole;
  canPublishMinutes: boolean;
  memberships: MembershipInfo[];
};

export type AdminActor = {
  kind: "admin";
  sessionId: string;
  adminId: string;
  name: string;
  email: string;
  organizationId: string;
  /** Every committee in this admin's HOA. Admin permissions apply only to these. */
  committeeIds: string[];
};

export type Actor = MemberActor | AdminActor;

/** Loads the signed-in member and their active committee memberships (re-validated on every request). */
export const getMemberContext = cache(async () => {
  const org = await getOrganizationSafe();
  if (!org || !orgAccess(org).active) return null; // wrong site, or the HOA's account isn't active
  const session = await loadSession("member");
  if (!session?.memberId) return null;
  const member = await db.member.findUnique({
    where: { id: session.memberId },
    select: {
      id: true, firstName: true, lastName: true, status: true, organizationId: true,
      memberships: {
        where: { isActive: true, committee: { status: "ACTIVE" } },
        select: {
          id: true, role: true, canPublishMinutes: true, position: true,
          committee: { select: { id: true, name: true } },
        },
        orderBy: { committee: { name: "asc" } },
      },
    },
  });
  if (member && member.organizationId !== org.id) return null; // a session from another HOA's address: ignore it, don't revoke it
  if (!member || member.status !== "ACTIVE" || member.memberships.length === 0) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const memberships: MembershipInfo[] = member.memberships.map((m) => ({
    membershipId: m.id,
    committeeId: m.committee.id,
    committeeName: m.committee.name,
    role: m.role,
    canPublishMinutes: m.canPublishMinutes,
    position: m.position,
  }));
  let active = memberships.find((m) => m.committeeId === session.activeCommitteeId) ?? null;
  if (!active && memberships.length === 1) active = memberships[0];
  return {
    sessionId: session.id,
    member: { id: member.id, name: `${member.firstName} ${member.lastName}`, organizationId: member.organizationId },
    memberships,
    active,
  };
});

/** Use in every member page/action. Redirects to login or committee selection when needed. */
export async function requireMember(): Promise<MemberActor> {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/login");
  if (!ctx.active) redirect("/portal/select");
  return {
    kind: "member",
    sessionId: ctx.sessionId,
    memberId: ctx.member.id,
    name: ctx.member.name,
    organizationId: ctx.member.organizationId,
    committeeId: ctx.active.committeeId,
    committeeName: ctx.active.committeeName,
    role: ctx.active.role,
    canPublishMinutes: ctx.active.canPublishMinutes,
    memberships: ctx.memberships,
  };
}

export async function setActiveCommittee(committeeId: string) {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/login");
  if (!ctx.memberships.some((m) => m.committeeId === committeeId)) {
    throw new Error("You are not a member of that committee.");
  }
  await db.session.update({ where: { id: ctx.sessionId }, data: { activeCommitteeId: committeeId } });
}

// ---------------- Admin context ----------------

export const getAdminContext = cache(async (): Promise<AdminActor | null> => {
  const org = await getOrganizationSafe();
  if (!org) return null;
  const session = await loadSession("admin");
  if (!session?.adminUserId) return null;
  const admin = await db.adminUser.findUnique({
    where: { id: session.adminUserId },
    select: { id: true, name: true, email: true, status: true, organizationId: true },
  });
  if (admin && admin.organizationId !== org.id) return null; // another HOA's session: ignore, don't revoke
  if (!admin || admin.status !== "ACTIVE") {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  const committees = await db.committee.findMany({ where: { organizationId: org.id }, select: { id: true } });
  return {
    kind: "admin",
    sessionId: session.id,
    adminId: admin.id,
    name: admin.name,
    email: admin.email,
    organizationId: org.id,
    committeeIds: committees.map((c) => c.id),
  };
});

// ---------------- Platform owner (you) ----------------

export type PlatformActor = { kind: "platform"; sessionId: string; userId: string; name: string; email: string };

export const getPlatformContext = cache(async (): Promise<PlatformActor | null> => {
  const session = await loadSession("platform");
  if (!session?.platformUserId) return null;
  const u = await db.platformUser.findUnique({ where: { id: session.platformUserId } });
  if (!u || u.status !== "ACTIVE") {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return { kind: "platform", sessionId: session.id, userId: u.id, name: u.name, email: u.email };
});

export async function requirePlatform(): Promise<PlatformActor> {
  const p = await getPlatformContext();
  if (!p) redirect("/platform/login");
  return p;
}

export async function requireAdmin(): Promise<AdminActor> {
  const admin = await getAdminContext();
  if (!admin) redirect("/admin/login");
  return admin;
}

/** For shared server actions used by both the member portal and the admin portal. */
export async function requireActor(scope: string | null | undefined): Promise<Actor> {
  return scope === "admin" ? requireAdmin() : requireMember();
}

export async function revokeMemberSessions(memberId: string) {
  await db.session.deleteMany({ where: { memberId } });
}

/** For route handlers (downloads/exports): admin session first, then member session. No redirects. */
export async function getRouteActor(): Promise<Actor | null> {
  const admin = await getAdminContext();
  if (admin) return admin;
  const ctx = await getMemberContext();
  if (!ctx?.active) return null;
  return {
    kind: "member",
    sessionId: ctx.sessionId,
    memberId: ctx.member.id,
    name: ctx.member.name,
    organizationId: ctx.member.organizationId,
    committeeId: ctx.active.committeeId,
    committeeName: ctx.active.committeeName,
    role: ctx.active.role,
    canPublishMinutes: ctx.active.canPublishMinutes,
    memberships: ctx.memberships,
  };
}
