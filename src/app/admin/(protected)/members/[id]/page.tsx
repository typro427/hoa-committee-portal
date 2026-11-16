import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { env } from "@/lib/env";
import { isUuid } from "@/server/loaders";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PinResultForm } from "@/components/pin-result-form";
import { PageHeader, RoleBadge, Section } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Options, Select } from "@/components/ui/form";
import { formatDateTime, ROLE_LABELS } from "@/lib/format";
import {
  generateMemberPin, removeMembership, revokeMemberPin, revokeSessions, saveMembership, setMemberStatus, updateMember,
} from "@/server/admin-actions";

export const metadata = { title: "Member" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const org = await getOrganization();
  const m = await db.member.findUnique({
    where: { id },
    select: {
      id: true, organizationId: true, firstName: true, lastName: true, email: true, phone: true, status: true,
      lastLoginAt: true, pinGeneratedAt: true, createdAt: true,
      memberships: { include: { committee: { select: { id: true, name: true, status: true } } }, orderBy: { joinedAt: "asc" } },
      _count: { select: { sessions: true } },
    },
  });
  if (!m || m.organizationId !== org.id) notFound();
  const committees = await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const activity = await db.auditLog.findMany({
    where: { OR: [{ actorMemberId: id }, { entityType: "member", entityId: id }] },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const active = m.memberships.filter((x) => x.isActive);
  const past = m.memberships.filter((x) => !x.isActive);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/admin/members", label: "Members" }}
        title={`${m.firstName} ${m.lastName}`}
        description={<div className="flex gap-2">{m.status === "ACTIVE" ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}<span>Member since {formatDateTime(m.createdAt, org.timezone)}</span></div>}
      />

      <Section title="PIN access">
        <dl className="mb-4 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="font-semibold text-slate-500">PIN</dt><dd>{m.pinGeneratedAt ? `Issued ${formatDateTime(m.pinGeneratedAt, org.timezone)}` : <span className="text-amber-700">Not issued</span>}</dd></div>
          <div><dt className="font-semibold text-slate-500">Last sign-in</dt><dd>{formatDateTime(m.lastLoginAt, org.timezone)}</dd></div>
          <div><dt className="font-semibold text-slate-500">Active sessions</dt><dd>{m._count.sessions}</dd></div>
        </dl>
        <div className="flex flex-col gap-3">
          <PinResultForm action={generateMemberPin} orgName={org.name} loginUrl={`${env.appUrl}/login`} confirm={m.pinGeneratedAt ? "Generate a new PIN? The current PIN will stop working immediately." : undefined}>
            <input type="hidden" name="memberId" value={m.id} />
            <SubmitButton pendingText="Generating…">{m.pinGeneratedAt ? "Reset PIN" : "Generate PIN"}</SubmitButton>
          </PinResultForm>
          <div className="flex flex-wrap gap-2">
            {m.pinGeneratedAt && (
              <ActionForm action={revokeMemberPin} confirm="Revoke this PIN? The member will not be able to sign in.">
                <input type="hidden" name="memberId" value={m.id} />
                <SubmitButton variant="outline">Revoke PIN</SubmitButton>
              </ActionForm>
            )}
            <ActionForm action={revokeSessions}>
              <input type="hidden" name="memberId" value={m.id} />
              <SubmitButton variant="outline">Sign out all sessions</SubmitButton>
            </ActionForm>
            <ActionForm action={setMemberStatus} confirm={m.status === "ACTIVE" ? "Deactivate this member? They will be signed out and unable to sign in." : undefined}>
              <input type="hidden" name="memberId" value={m.id} />
              <input type="hidden" name="status" value={m.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"} />
              <SubmitButton variant={m.status === "ACTIVE" ? "destructive" : "success"}>{m.status === "ACTIVE" ? "Deactivate member" : "Reactivate member"}</SubmitButton>
            </ActionForm>
          </div>
        </div>
      </Section>

      <Section title="Committee assignments">
        {active.length === 0 && <p className="mb-3 text-sm text-amber-700">Not assigned to any committee — this member can&apos;t sign in until assigned.</p>}
        <ul className="flex flex-col gap-3">
          {active.map((ms) => (
            <li key={ms.id} className="rounded-lg border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Link href={`/admin/committees/${ms.committee.id}`} className="font-semibold hover:underline">{ms.committee.name}</Link>
                <RoleBadge role={ms.role} />
                {ms.committee.status === "ARCHIVED" && <Badge>Archived</Badge>}
              </div>
              <ActionForm action={saveMembership} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                <input type="hidden" name="memberId" value={m.id} />
                <input type="hidden" name="committeeId" value={ms.committee.id} />
                <Field label="Role" htmlFor={`r-${ms.id}`}><Select id={`r-${ms.id}`} name="role" defaultValue={ms.role}><Options labels={ROLE_LABELS} /></Select></Field>
                <Field label="Position title" htmlFor={`p-${ms.id}`}><Input id={`p-${ms.id}`} name="position" defaultValue={ms.position ?? ""} /></Field>
                <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" name="canPublishMinutes" defaultChecked={ms.canPublishMinutes} className="size-4" /> Secretary may publish minutes</label>
                <SubmitButton size="sm">Save</SubmitButton>
              </ActionForm>
              <ActionForm action={removeMembership} confirm={`Remove from ${ms.committee.name}?`} className="mt-1">
                <input type="hidden" name="membershipId" value={ms.id} />
                <SubmitButton size="sm" variant="ghost" className="text-red-700">Remove from committee</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
        <ActionForm action={saveMembership} resetOnSuccess className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="memberId" value={m.id} />
          <Field label="Assign to committee" htmlFor="as-c">
            <Select id="as-c" name="committeeId" required defaultValue="">
              <option value="">Choose…</option>
              {committees.filter((c) => !active.some((a) => a.committee.id === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Role" htmlFor="as-r"><Select id="as-r" name="role" defaultValue="MEMBER"><Options labels={ROLE_LABELS} /></Select></Field>
          <Field label="Position" htmlFor="as-p"><Input id="as-p" name="position" /></Field>
          <SubmitButton size="sm">Assign</SubmitButton>
        </ActionForm>
        {past.length > 0 && <p className="mt-3 text-sm text-slate-500">Former committees: {past.map((p) => p.committee.name).join(", ")}</p>}
      </Section>

      <Section title="Member information">
        <ActionForm action={updateMember} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="memberId" value={m.id} />
          <Field label="First name" htmlFor="firstName"><Input id="firstName" name="firstName" defaultValue={m.firstName} required /></Field>
          <Field label="Last name" htmlFor="lastName"><Input id="lastName" name="lastName" defaultValue={m.lastName} required /></Field>
          <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={m.email ?? ""} /></Field>
          <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={m.phone ?? ""} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </Section>

      <Section title="Activity">
        {activity.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
          <ul className="divide-y text-sm">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span><span className="font-medium">{a.actorName}</span> · {a.action}</span>
                <span className="text-slate-500">{formatDateTime(a.createdAt, org.timezone)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
