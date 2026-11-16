import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { isUuid } from "@/server/loaders";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, RoleBadge, Section, StatCard } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { formatDateTime, ROLE_LABELS } from "@/lib/format";
import { removeMembership, saveMembership, setCommitteeArb, setCommitteeStatus, updateCommittee } from "@/server/admin-actions";

export const metadata = { title: "Committee" };

export default async function CommitteePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const org = await getOrganization();
  const c = await db.committee.findUnique({
    where: { id },
    include: {
      memberships: { where: { isActive: true }, include: { member: { select: { id: true, firstName: true, lastName: true, status: true, pinHash: true } } } },
      _count: { select: { meetings: true, documents: true, tasks: true } },
    },
  });
  if (!c || c.organizationId !== org.id) notFound();
  const order = { CHAIR: 0, SECRETARY: 1, MEMBER: 2 };
  const members = [...c.memberships].sort((a, b) => order[a.role] - order[b.role] || a.member.lastName.localeCompare(b.member.lastName));
  const nonMembers = await db.member.findMany({
    where: { organizationId: org.id, status: "ACTIVE", NOT: { memberships: { some: { committeeId: id, isActive: true } } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
  const activity = await db.auditLog.findMany({ where: { committeeId: id }, orderBy: { createdAt: "desc" }, take: 15 });
  const published = await db.meetingMinutes.count({ where: { status: "PUBLISHED", meeting: { committeeId: id } } });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/admin/committees", label: "Committees" }}
        title={c.name}
        description={c.status === "ARCHIVED" ? <Badge>Archived</Badge> : c.description}
        actions={<Link href={`/admin/reports?committee=${c.id}`} className={buttonVariants({ variant: "outline" })}>Reports</Link>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Members" value={members.length} />
        <StatCard label="Meetings" value={c._count.meetings} href={`/admin/meetings?committee=${c.id}`} />
        <StatCard label="Published minutes" value={published} href={`/admin/minutes?committee=${c.id}`} />
        <StatCard label="Documents" value={c._count.documents} href={`/admin/documents?committee=${c.id}`} />
      </div>

      <Section title="Members">
        <ul className="divide-y rounded-lg border">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/members/${m.member.id}`} className="font-semibold hover:underline">{m.member.firstName} {m.member.lastName}</Link>
                <div className="flex flex-wrap gap-1">
                  <RoleBadge role={m.role} />
                  {m.canPublishMinutes && <Badge tone="blue">Can publish</Badge>}
                  {m.member.status !== "ACTIVE" && <Badge tone="red">Inactive</Badge>}
                  {!m.member.pinHash && <Badge tone="amber">No PIN</Badge>}
                </div>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-navy-700">Change role</summary>
                <ActionForm action={saveMembership} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                  <input type="hidden" name="memberId" value={m.member.id} />
                  <input type="hidden" name="committeeId" value={c.id} />
                  <Field label="Role" htmlFor={`r-${m.id}`}><Select id={`r-${m.id}`} name="role" defaultValue={m.role}><Options labels={ROLE_LABELS} /></Select></Field>
                  <Field label="Position title" htmlFor={`p-${m.id}`}><Input id={`p-${m.id}`} name="position" defaultValue={m.position ?? ""} placeholder="Optional" /></Field>
                  <label className="flex h-11 items-center gap-2 text-sm"><input type="checkbox" name="canPublishMinutes" defaultChecked={m.canPublishMinutes} className="size-4" /> Secretary may publish</label>
                  <SubmitButton size="sm">Save</SubmitButton>
                </ActionForm>
                <ActionForm action={removeMembership} confirm={`Remove ${m.member.firstName} from ${c.name}?`} className="mt-2">
                  <input type="hidden" name="membershipId" value={m.id} />
                  <SubmitButton size="sm" variant="ghost" className="text-red-700">Remove from committee</SubmitButton>
                </ActionForm>
              </details>
            </li>
          ))}
          {members.length === 0 && <li className="p-3 text-sm text-slate-500">No members yet.</li>}
        </ul>
        <ActionForm action={saveMembership} resetOnSuccess className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="committeeId" value={c.id} />
          <Field label="Add existing member" htmlFor="add-member">
            <Select id="add-member" name="memberId" required defaultValue="">
              <option value="">Choose…</option>
              {nonMembers.map((m) => <option key={m.id} value={m.id}>{m.lastName}, {m.firstName}</option>)}
            </Select>
          </Field>
          <Field label="Role" htmlFor="add-role"><Select id="add-role" name="role" defaultValue="MEMBER"><Options labels={ROLE_LABELS} /></Select></Field>
          <Field label="Position" htmlFor="add-pos"><Input id="add-pos" name="position" placeholder="Optional" /></Field>
          <SubmitButton size="sm">Add</SubmitButton>
        </ActionForm>
        <p className="mt-2 text-sm text-slate-500">New person? <Link href={`/admin/members?committee=${c.id}`} className="font-medium text-navy-700 underline">Create a member</Link>.</p>
      </Section>

      <Section title="Committee details">
        <ActionForm action={updateCommittee} className="grid gap-4">
          <input type="hidden" name="committeeId" value={c.id} />
          <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={c.name} required /></Field>
          <Field label="Description" htmlFor="description"><Textarea id="description" name="description" rows={2} defaultValue={c.description ?? ""} /></Field>
          <div><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
        <ActionForm action={setCommitteeArb} className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">
          <input type="hidden" name="committeeId" value={c.id} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="handlesArbRequests" defaultChecked={c.handlesArbRequests} className="mt-0.5 size-4" />
            <span><span className="font-medium">Receives architectural (ARB) requests</span><br /><span className="text-slate-500">Residents&apos; requests from the public form go to this committee, and its members get an ARB Requests tab.</span></span>
          </label>
          <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
        </ActionForm>
        <ActionForm
          action={setCommitteeStatus}
          confirm={c.status === "ACTIVE" ? "Archive this committee? Members will no longer be able to open it, but all records are kept." : undefined}
          className="mt-5 border-t pt-4"
        >
          <input type="hidden" name="committeeId" value={c.id} />
          <input type="hidden" name="status" value={c.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE"} />
          <SubmitButton variant="outline">{c.status === "ACTIVE" ? "Archive committee" : "Reactivate committee"}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Recent activity" actions={<Link href={`/admin/audit?committee=${c.id}`} className="text-sm font-medium text-navy-700">Full log</Link>}>
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
