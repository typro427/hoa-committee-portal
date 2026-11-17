import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { hoaUrl, rootDomain } from "@/lib/tenant";
import { EmptyState, PageHeader, StatCard } from "@/components/common";
import { OrgStatusBadge } from "@/components/org-status";
import { buttonVariants } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { trialDaysLeft } from "@/lib/org";

export const metadata = { title: "HOAs" };

export default async function PlatformHome() {
  const orgs = await db.organization.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { committees: true, members: true } } },
  });
  const byStatus = (s: string) => orgs.filter((o) => o.status === s).length;
  const lastActivity = await db.auditLog.groupBy({ by: ["organizationId"], _max: { createdAt: true } });
  const last = new Map(lastActivity.map((a) => [a.organizationId, a._max.createdAt]));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="HOAs" description="Every HOA using the software." actions={<Link href="/platform/hoas/new" className={buttonVariants()}><Plus /> New HOA</Link>} />
      {!rootDomain() && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Running in <b>single-HOA mode</b> (no <code>ROOT_DOMAIN</code> set), so every address shows the first HOA. Set <code>ROOT_DOMAIN</code> to give each HOA its own address.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="HOAs" value={orgs.length} />
        <StatCard label="Active" value={byStatus("ACTIVE")} tone="green" />
        <StatCard label="On trial" value={byStatus("TRIAL")} />
        <StatCard label="Past due / suspended" value={byStatus("PAST_DUE") + byStatus("SUSPENDED")} tone={byStatus("PAST_DUE") + byStatus("SUSPENDED") ? "amber" : "navy"} />
      </div>
      {orgs.length === 0 ? <EmptyState>No HOAs yet.</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-white shadow-sm">
          {orgs.map((o) => {
            const days = trialDaysLeft(o);
            return (
              <li key={o.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/platform/hoas/${o.id}`} className="min-w-0">
                  <p className="font-semibold text-slate-900 hover:underline">{o.name}</p>
                  <p className="truncate text-sm text-slate-500">{rootDomain() ? hoaUrl(o.slug).replace(/^https?:\/\//, "") : o.slug} · {o._count.committees} committee{o._count.committees === 1 ? "" : "s"} · {o._count.members} member{o._count.members === 1 ? "" : "s"} · since {formatDate(o.createdAt, "short")}</p>
                  <p className="text-xs text-slate-400">Last activity: {last.get(o.id) ? formatDate(last.get(o.id)!, "short") : "none"}</p>
                </Link>
                <div className="flex items-center gap-2">
                  {days !== null && days > 0 && <span className="text-xs text-slate-500">{days} day{days === 1 ? "" : "s"} left</span>}
                  <OrgStatusBadge status={o.status} trialEndsAt={o.trialEndsAt} />
                  {rootDomain() && <a href={hoaUrl(o.slug)} target="_blank" rel="noopener" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label={`Open ${o.name}`}><ExternalLink className="size-4" /></a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
