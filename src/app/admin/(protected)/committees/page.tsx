import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader, Section } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea } from "@/components/ui/form";
import { createCommittee } from "@/server/admin-actions";

export const metadata = { title: "Committees" };

export default async function CommitteesPage() {
  await requireAdmin();
  const org = await getOrganization();
  const committees = await db.committee.findMany({
    where: { organizationId: org.id },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      memberships: { where: { isActive: true }, select: { role: true, member: { select: { firstName: true, lastName: true } } } },
      _count: { select: { meetings: true, documents: true } },
    },
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Committees" description="Create and manage committees. Archived committees keep all their history." />
      {committees.length === 0 ? <EmptyState>No committees yet. Create your first one below.</EmptyState> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {committees.map((c) => {
            const chair = c.memberships.find((m) => m.role === "CHAIR");
            return (
              <li key={c.id}>
                <Link href={`/admin/committees/${c.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-navy-300">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><p className="font-semibold text-navy-900">{c.name}</p>{c.status === "ARCHIVED" && <Badge>Archived</Badge>}</div>
                    <p className="text-sm text-slate-600">Chair: {chair ? `${chair.member.firstName} ${chair.member.lastName}` : <span className="text-amber-700">Not assigned</span>}</p>
                    <p className="text-xs text-slate-500">{c.memberships.length} members · {c._count.meetings} meetings · {c._count.documents} documents</p>
                  </div>
                  <ChevronRight className="size-5 text-slate-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Section title="Create a committee">
        <ActionForm action={createCommittee} className="grid gap-4">
          <Field label="Committee name" htmlFor="name"><Input id="name" name="name" required maxLength={120} placeholder="e.g. Architectural Review Board" /></Field>
          <Field label="Description (optional)" htmlFor="description"><Textarea id="description" name="description" rows={2} /></Field>
          <div><SubmitButton>Create Committee</SubmitButton></div>
        </ActionForm>
      </Section>
    </div>
  );
}
