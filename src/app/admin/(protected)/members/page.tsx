import Link from "next/link";
import { Search } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { env } from "@/lib/env";
import { EmptyState, PageHeader, RoleBadge, Section } from "@/components/common";
import { PinResultForm } from "@/components/pin-result-form";
import { SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select } from "@/components/ui/form";
import { formatDate, ROLE_LABELS } from "@/lib/format";
import { createMember } from "@/server/admin-actions";

export const metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; committee?: string; status?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const org = await getOrganization();
  const committees = await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" } });
  const where: Prisma.MemberWhereInput = {
    organizationId: org.id,
    ...(sp.status === "INACTIVE" ? { status: "INACTIVE" } : sp.status === "all" ? {} : { status: "ACTIVE" }),
    ...(sp.committee ? { memberships: { some: { committeeId: sp.committee, isActive: true } } } : {}),
    ...(sp.q ? { OR: [{ firstName: { contains: sp.q, mode: "insensitive" } }, { lastName: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const members = await db.member.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true, firstName: true, lastName: true, email: true, status: true, lastLoginAt: true, pinGeneratedAt: true,
      memberships: { where: { isActive: true }, select: { role: true, committee: { select: { name: true } } } },
    },
  });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Members" description="Committee members sign in with an individual PIN." />
      <Section title="Add a member">
        <PinResultForm action={createMember} orgName={org.name} loginUrl={`${env.appUrl}/login`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="First name" htmlFor="firstName"><Input id="firstName" name="firstName" required /></Field>
            <Field label="Last name" htmlFor="lastName"><Input id="lastName" name="lastName" required /></Field>
            <Field label="Email (optional)" htmlFor="email"><Input id="email" name="email" type="email" /></Field>
            <Field label="Phone (optional)" htmlFor="phone"><Input id="phone" name="phone" type="tel" /></Field>
            <Field label="Committee" htmlFor="committeeId">
              <Select id="committeeId" name="committeeId" defaultValue={sp.committee ?? ""}>
                <option value="">— None yet —</option>
                {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Committee role" htmlFor="role"><Select id="role" name="role" defaultValue="MEMBER"><Options labels={ROLE_LABELS} /></Select></Field>
            <Field label="Position title (optional)" htmlFor="position"><Input id="position" name="position" placeholder="e.g. Vice Chair" /></Field>
            <Field label="Account status" htmlFor="status"><Select id="status" name="status" defaultValue="ACTIVE"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></Field>
            <label className="flex items-center gap-2 self-end pb-3 text-sm font-medium"><input type="checkbox" name="generatePin" defaultChecked className="size-4" /> Generate PIN now</label>
          </div>
          <SubmitButton className="mt-4">Create Member</SubmitButton>
        </PinResultForm>
      </Section>

      <form className="flex flex-wrap gap-2" action="/admin/members">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input name="q" defaultValue={sp.q} placeholder="Search by name or email" className="pl-9" aria-label="Search members" />
        </div>
        <Select name="committee" defaultValue={sp.committee ?? ""} className="w-auto">
          <option value="">All committees</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="status" defaultValue={sp.status ?? ""} className="w-auto">
          <option value="">Active</option><option value="INACTIVE">Inactive</option><option value="all">All</option>
        </Select>
        <button className={buttonVariants({ variant: "outline" })}>Filter</button>
      </form>

      {members.length === 0 ? <EmptyState>No members found.</EmptyState> : (
        <ul className="divide-y rounded-xl border border-slate-200 bg-white shadow-sm">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/members/${m.id}`} className="flex flex-col gap-1 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{m.lastName}, {m.firstName}</p>
                  <p className="truncate text-sm text-slate-500">{m.memberships.map((x) => x.committee.name).join(", ") || "No committee"}{m.email ? ` · ${m.email}` : ""}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {m.memberships.filter((x) => x.role !== "MEMBER").map((x, i) => <RoleBadge key={i} role={x.role} />)}
                  {m.status === "INACTIVE" && <Badge tone="red">Inactive</Badge>}
                  {!m.pinGeneratedAt ? <Badge tone="amber">No PIN</Badge> : <span className="text-xs text-slate-500">Last sign-in: {m.lastLoginAt ? formatDate(m.lastLoginAt, "short") : "never"}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
