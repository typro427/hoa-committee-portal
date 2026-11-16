import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { env } from "@/lib/env";
import { PageHeader, Section } from "@/components/common";
import { PinResultForm } from "@/components/pin-result-form";
import { SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { bulkGeneratePins, generateMemberPin } from "@/server/admin-actions";

export const metadata = { title: "PIN Management" };

export default async function PinsPage() {
  await requireAdmin();
  const org = await getOrganization();
  const committees = await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const members = await db.member.findMany({
    where: { organizationId: org.id },
    orderBy: [{ status: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, status: true, pinGeneratedAt: true, lastLoginAt: true, memberships: { where: { isActive: true }, select: { committee: { select: { name: true } } } } },
  });
  const missing = members.filter((m) => m.status === "ACTIVE" && !m.pinGeneratedAt).length;
  const loginUrl = `${env.appUrl}/login`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="PIN Management" description="Each member has a unique 8-digit PIN. PINs are stored only as secure hashes and are shown once, when generated." />
      <Section title="Generate missing PINs">
        <p className="mb-3 text-sm text-slate-600">{missing} active member{missing === 1 ? "" : "s"} without a PIN.</p>
        <PinResultForm action={bulkGeneratePins} orgName={org.name} loginUrl={loginUrl} confirm="Generate PINs for every active member who doesn't have one?">
          <div className="flex flex-wrap gap-2">
            <Select name="committeeId" defaultValue="" className="w-auto" aria-label="Committee">
              <option value="">All committees</option>
              {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <SubmitButton pendingText="Generating…" disabled={missing === 0}>Generate PINs</SubmitButton>
          </div>
        </PinResultForm>
      </Section>
      <Section title="All members">
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link href={`/admin/members/${m.id}`} className="font-semibold hover:underline">{m.firstName} {m.lastName}</Link>
                <p className="text-sm text-slate-500">{m.memberships.map((x) => x.committee.name).join(", ") || "No committee"}</p>
                <p className="text-xs text-slate-500">
                  {m.pinGeneratedAt ? `PIN issued ${formatDateTime(m.pinGeneratedAt, org.timezone)}` : "No PIN issued"} · Last sign-in {m.lastLoginAt ? formatDateTime(m.lastLoginAt, org.timezone) : "never"}
                </p>
                {m.status === "INACTIVE" && <Badge tone="red">Inactive</Badge>}
              </div>
              <PinResultForm action={generateMemberPin} orgName={org.name} loginUrl={loginUrl} confirm={m.pinGeneratedAt ? `Reset ${m.firstName}'s PIN? The current PIN stops working immediately.` : undefined} className="sm:max-w-md">
                <input type="hidden" name="memberId" value={m.id} />
                <SubmitButton size="sm" variant={m.pinGeneratedAt ? "outline" : "default"} pendingText="…">{m.pinGeneratedAt ? "Reset PIN" : "Generate PIN"}</SubmitButton>
              </PinResultForm>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
