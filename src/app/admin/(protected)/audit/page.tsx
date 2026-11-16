import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { EmptyState, PageHeader } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Audit Log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ committee?: string; entity?: string; q?: string; page?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const org = await getOrganization();
  const page = Math.max(1, Number(sp.page) || 1);
  const committees = await db.committee.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } });
  const where: Prisma.AuditLogWhereInput = {
    organizationId: org.id,
    ...(sp.committee ? { committeeId: sp.committee } : {}),
    ...(sp.entity ? { entityType: sp.entity } : {}),
    ...(sp.q ? { OR: [{ action: { contains: sp.q, mode: "insensitive" } }, { actorName: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [total, logs, entityTypes] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.findMany({ where: { organizationId: org.id }, distinct: ["entityType"], select: { entityType: true } }),
  ]);
  const cname = new Map(committees.map((c) => [c.id, c.name]));
  const qs = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...sp, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/admin/audit?${s}`;
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Audit Log" description={`${total.toLocaleString()} recorded actions. Audit records are permanent.`} />
      <form action="/admin/audit" className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={sp.q} placeholder="Search action or person" className="w-auto flex-1" aria-label="Search" />
        <Select name="committee" defaultValue={sp.committee ?? ""} className="w-auto">
          <option value="">All committees</option>
          {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select name="entity" defaultValue={sp.entity ?? ""} className="w-auto">
          <option value="">All record types</option>
          {entityTypes.map((e) => <option key={e.entityType} value={e.entityType}>{e.entityType}</option>)}
        </Select>
        <button className={buttonVariants({ variant: "outline" })}>Filter</button>
      </form>
      {logs.length === 0 ? <EmptyState>No matching activity.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {logs.map((l) => (
            <li key={l.id} className="p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2">
                <span><span className="font-semibold">{l.actorName ?? "System"}</span> · <code className="rounded bg-slate-100 px-1">{l.action}</code></span>
                <span className="text-slate-500">{formatDateTime(l.createdAt, org.timezone)}</span>
              </div>
              <p className="text-xs text-slate-500">
                {l.entityType}{l.entityId ? ` ${l.entityId.slice(0, 8)}` : ""}{l.committeeId ? ` · ${cname.get(l.committeeId) ?? ""}` : ""}
              </p>
              {l.detailsJson && <details className="mt-1"><summary className="cursor-pointer text-xs text-navy-700">Details</summary><pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(l.detailsJson, null, 2)}</pre></details>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-between">
        {page > 1 ? <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs(page - 1)}>← Newer</Link> : <span />}
        {page * PAGE < total && <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={qs(page + 1)}>Older →</Link>}
      </div>
    </div>
  );
}
