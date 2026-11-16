import Link from "next/link";
import { FileDown, FileText, PenLine } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { EmptyState, MinutesStatusBadge, PageHeader, Tabs } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { formatDate } from "@/lib/format";

type SP = { tab?: string; committee?: string; year?: string };

export async function MinutesListView({ actor, sp }: { actor: Actor; sp: SP }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const org = await getOrganization();
  const leadership = actor.kind === "admin" || can.viewDraftMinutes(actor, actor.committeeId);
  const tab = leadership && sp.tab === "progress" ? "progress" : "published";
  const committeeFilter = actor.kind === "member" ? actor.committeeId : sp.committee || undefined;
  const yearNum = sp.year && /^\d{4}$/.test(sp.year) ? Number(sp.year) : undefined;

  const baseWhere: Prisma.MeetingMinutesWhereInput = {
    meeting: {
      committeeId: committeeFilter,
      committee: { organizationId: org.id },
      ...(yearNum ? { meetingDate: { gte: new Date(Date.UTC(yearNum, 0, 1)), lt: new Date(Date.UTC(yearNum + 1, 0, 1)) } } : {}),
    },
  };
  const [publishedCount, progressCount] = await Promise.all([
    db.meetingMinutes.count({ where: { ...baseWhere, status: "PUBLISHED" } }),
    leadership ? db.meetingMinutes.count({ where: { ...baseWhere, status: { not: "PUBLISHED" } } }) : 0,
  ]);
  const minutes = await db.meetingMinutes.findMany({
    where: { ...baseWhere, status: tab === "published" ? "PUBLISHED" : { not: "PUBLISHED" } },
    include: { meeting: { select: { title: true, meetingDate: true, committee: { select: { name: true } } } } },
    orderBy: tab === "progress" ? [{ status: "asc" }, { meeting: { meetingDate: "desc" } }] : [{ meeting: { meetingDate: "desc" } }],
    take: 300,
  });

  const committees = actor.kind === "admin" ? await db.committee.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }) : [];
  const range = await db.meeting.aggregate({
    where: { committeeId: committeeFilter, committee: { organizationId: org.id } },
    _min: { meetingDate: true },
    _max: { meetingDate: true },
  });
  const thisYear = new Date().getUTCFullYear();
  const minY = range._min.meetingDate?.getUTCFullYear() ?? thisYear;
  const maxY = Math.max(range._max.meetingDate?.getUTCFullYear() ?? thisYear, thisYear);
  const years = Array.from({ length: maxY - minY + 1 }, (_, i) => maxY - i);

  // Completed meetings that still need minutes (leadership only).
  const needMinutes = leadership
    ? await db.meeting.findMany({
        where: { committeeId: committeeFilter, committee: { organizationId: org.id }, status: "COMPLETED", minutes: null },
        orderBy: { meetingDate: "desc" },
        take: 10,
        include: { committee: { select: { name: true } } },
      })
    : [];

  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${base}/minutes?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Meeting Minutes"
        description={actor.kind === "admin" ? "Minutes across all committees" : "Official records of committee meetings"}
        actions={leadership && (
          <Link href={`${base}/minutes/new`} className={buttonVariants()}><PenLine /> Write minutes</Link>
        )}
      />
      {leadership && (
        <Tabs
          current={tab}
          tabs={[
            { key: "published", label: "Published", href: qs({ tab: undefined }), count: publishedCount },
            { key: "progress", label: actor.kind === "admin" ? "Drafts & Awaiting Approval" : "In Progress", href: qs({ tab: "progress" }), count: progressCount },
          ]}
        />
      )}
      <form action={`${base}/minutes`} className="mb-4 flex flex-wrap gap-2 no-print">
        {tab === "progress" && <input type="hidden" name="tab" value="progress" />}
        {actor.kind === "admin" && (
          <Select name="committee" defaultValue={sp.committee ?? ""} className="h-10 w-auto">
            <option value="">All committees</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}
        <Select name="year" defaultValue={sp.year ?? ""} className="h-10 w-auto">
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
        <button className={buttonVariants({ variant: "outline", size: "sm" })}>Filter</button>
      </form>

      {needMinutes.length > 0 && tab === "progress" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-semibold text-amber-900">Completed meetings without minutes</p>
          <ul className="flex flex-col gap-1">
            {needMinutes.map((m) => (
              <li key={m.id}>
                <Link href={`${base}/meetings/${m.id}`} className="text-sm font-medium text-amber-900 underline">
                  {formatDate(m.meetingDate, "short")} — {m.title}{actor.kind === "admin" ? ` (${m.committee.name})` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {minutes.length === 0 ? (
        <EmptyState>{tab === "published" ? "No minutes have been published yet." : "No minutes are in progress."}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {minutes.map((mm) => (
            <li key={mm.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <FileText className="size-6 shrink-0 text-navy-600" />
              <Link href={`${base}/minutes/${mm.id}`} className="min-w-0 flex-1">
                <p className="font-semibold text-navy-900 hover:underline">{formatDate(mm.meeting.meetingDate, "medium")}</p>
                <p className="truncate text-sm text-slate-600">{mm.meeting.title}{actor.kind === "admin" ? ` · ${mm.meeting.committee.name}` : ""}</p>
                <div className="mt-1"><MinutesStatusBadge status={mm.status} /></div>
              </Link>
              {mm.status === "PUBLISHED" && (
                <a href={`/api/minutes/${mm.id}/pdf`} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Download PDF"><FileDown /></a>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
