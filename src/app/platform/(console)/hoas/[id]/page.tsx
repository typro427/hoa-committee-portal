import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { db } from "@/lib/db";
import { hoaUrl, rootDomain } from "@/lib/tenant";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { PageHeader, Section, StatCard } from "@/components/common";
import { OrgStatusBadge, ORG_STATUS_LABELS } from "@/components/org-status";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { dateToISO, formatDateTime } from "@/lib/format";
import { setHoaAdmin, updateHoa } from "@/server/platform-actions";

export const metadata = { title: "HOA" };

export default async function HoaDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const org = await db.organization.findUnique({
    where: { id },
    include: {
      admins: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true } },
      _count: { select: { committees: true, members: true } },
    },
  });
  if (!org) notFound();
  const [meetings, docs, arb] = await Promise.all([
    db.meeting.count({ where: { committee: { organizationId: org.id } } }),
    db.document.count({ where: { committee: { organizationId: org.id }, removedAt: null } }),
    db.arbRequest.count({ where: { committee: { organizationId: org.id } } }),
  ]);
  const url = rootDomain() ? hoaUrl(org.slug) : null;
  const created = (await searchParams).created === "1";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: "/platform", label: "HOAs" }}
        title={org.name}
        description={<div className="flex items-center gap-2"><OrgStatusBadge status={org.status} trialEndsAt={org.trialEndsAt} />{org.trialEndsAt && org.status === "TRIAL" && <span>Trial ends {formatDateTime(org.trialEndsAt, org.timezone)}</span>}</div>}
        actions={url && <a href={url} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}><ExternalLink /> Open HOA site</a>}
      />
      {created && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">HOA created.</p>
          <p className="mt-1">Send the administrator their sign-in page and temporary password. They'll add members and issue PINs from there.</p>
          {url && <div className="mt-2"><CopyLink url={`${url}/admin/login`} label="Copy admin sign-in link" /></div>}
        </div>
      )}
      {url && (
        <Section title="Addresses">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-slate-500">Committee members</dt><dd><CopyLink url={`${url}/login`} /></dd></div>
            <div><dt className="font-semibold text-slate-500">HOA administrators</dt><dd><CopyLink url={`${url}/admin/login`} /></dd></div>
          </dl>
        </Section>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Committees" value={org._count.committees} />
        <StatCard label="Members" value={org._count.members} />
        <StatCard label="Meetings" value={meetings} />
        <StatCard label="Documents" value={docs} />
        <StatCard label="ARB requests" value={arb} />
      </div>
      <Section title="Account">
        <ActionForm action={updateHoa} className="grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="orgId" value={org.id} />
          <Field label="HOA name" htmlFor="name"><Input id="name" name="name" defaultValue={org.name} required /></Field>
          <Field label="Web address" htmlFor="slug" hint="Changing this changes the HOA's address; old links stop working."><Input id="slug" name="slug" defaultValue={org.slug} required pattern="[a-z0-9-]+" /></Field>
          <Field label="Status" htmlFor="status" hint="Suspended or cancelled HOAs keep their data, but members can't sign in. Everyone is signed out immediately.">
            <Select id="status" name="status" defaultValue={org.status}><Options labels={ORG_STATUS_LABELS} /></Select>
          </Field>
          <Field label="Trial ends" htmlFor="trialEndsAt"><Input id="trialEndsAt" name="trialEndsAt" type="date" defaultValue={dateToISO(org.trialEndsAt)} /></Field>
          <Field label="Billing contact" htmlFor="contactName"><Input id="contactName" name="contactName" defaultValue={org.contactName ?? ""} /></Field>
          <Field label="Billing email" htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" defaultValue={org.contactEmail ?? ""} /></Field>
          <Field label="Private notes (only you see these)" htmlFor="ownerNotes" className="sm:col-span-2"><Textarea id="ownerNotes" name="ownerNotes" rows={3} defaultValue={org.ownerNotes ?? ""} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </Section>
      <Section title="HOA administrators">
        <ul className="mb-4 divide-y rounded-lg border text-sm">
          {org.admins.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 p-3">
              <span><span className="font-medium">{a.name}</span> · {a.email}{a.status !== "ACTIVE" && " · disabled"}</span>
              <span className="text-slate-500">Last sign-in {formatDateTime(a.lastLoginAt, org.timezone)}</span>
            </li>
          ))}
          {org.admins.length === 0 && <li className="p-3 text-slate-500">No administrators.</li>}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">Add an administrator, or reset one's password</summary>
          <ActionForm action={setHoaAdmin} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="orgId" value={org.id} />
            <Field label="Name" htmlFor="a-name"><Input id="a-name" name="name" required /></Field>
            <Field label="Email" htmlFor="a-email" hint="An existing admin's email resets their password."><Input id="a-email" name="email" type="email" required /></Field>
            <Field label="Temporary password" htmlFor="a-pw"><Input id="a-pw" name="password" minLength={12} required autoComplete="off" /></Field>
            <div className="sm:col-span-3"><SubmitButton variant="secondary">Save administrator</SubmitButton></div>
          </ActionForm>
        </details>
      </Section>
    </div>
  );
}
