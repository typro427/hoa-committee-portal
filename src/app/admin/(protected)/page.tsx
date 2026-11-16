import Link from "next/link";
import { AlertCircle, Building2, CalendarDays, FileClock, FolderOpen, ListChecks, Users, History } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { MinutesStatusBadge, PageHeader, StatCard } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime, isoToDate, todayISO } from "@/lib/format";

export const metadata = { title: "Admin Dashboard" };

export default async function AdminDashboard() {
  await requireAdmin();
  const org = await getOrganization();
  const today = isoToDate(todayISO(org.timezone));
  const o = { committee: { organizationId: org.id } };
  const open = { notIn: ["COMPLETED", "CANCELLED"] as ("COMPLETED" | "CANCELLED")[] };
  const [committees, activeMembers, upcoming, recent, awaiting, openTasks, overdue, docs, upcomingList, recentList, awaitingList, recentDocs, noPin] = await Promise.all([
    db.committee.count({ where: { organizationId: org.id, status: "ACTIVE" } }),
    db.member.count({ where: { organizationId: org.id, status: "ACTIVE" } }),
    db.meeting.count({ where: { ...o, meetingDate: { gte: today }, status: { in: ["SCHEDULED", "POSTPONED"] } } }),
    db.meeting.count({ where: { ...o, meetingDate: { lt: today, gte: new Date(today.getTime() - 30 * 86400_000) } } }),
    db.meetingMinutes.count({ where: { meeting: o, status: { in: ["SUBMITTED", "APPROVED"] } } }),
    db.task.count({ where: { ...o, status: open } }),
    db.task.count({ where: { ...o, status: open, dueDate: { lt: today } } }),
    db.document.count({ where: { ...o, removedAt: null, arbRequestId: null, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } }),
    db.meeting.findMany({ where: { ...o, meetingDate: { gte: today }, status: { in: ["SCHEDULED", "POSTPONED"] } }, orderBy: [{ meetingDate: "asc" }], take: 5, include: { committee: { select: { name: true } } } }),
    db.meeting.findMany({ where: { ...o, meetingDate: { lt: today } }, orderBy: { meetingDate: "desc" }, take: 5, include: { committee: { select: { name: true } }, minutes: { select: { status: true } } } }),
    db.meetingMinutes.findMany({ where: { meeting: o, status: { in: ["SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "DRAFT"] } }, orderBy: { updatedAt: "desc" }, take: 6, include: { meeting: { select: { title: true, meetingDate: true, committee: { select: { name: true } } } } } }),
    db.document.findMany({ where: { ...o, removedAt: null, arbRequestId: null }, orderBy: { createdAt: "desc" }, take: 5, include: { committee: { select: { name: true } } } }),
    db.member.count({ where: { organizationId: org.id, status: "ACTIVE", pinHash: null } }),
  ]);
  const committeeCount = await db.committee.count({ where: { organizationId: org.id } });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Dashboard" description={org.name} />
      {committeeCount === 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-semibold">Welcome! Let&apos;s get set up.</p>
          <ol className="ml-5 mt-1 list-decimal">
            <li><Link className="underline" href="/admin/settings">Set your HOA name and logo</Link></li>
            <li><Link className="underline" href="/admin/committees">Create your committees</Link></li>
            <li><Link className="underline" href="/admin/members">Add committee members and assign chairs</Link></li>
            <li><Link className="underline" href="/admin/pins">Generate and distribute PINs</Link></li>
          </ol>
        </div>
      )}
      {noPin > 0 && (
        <Link href="/admin/pins" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          <AlertCircle className="size-5" /> {noPin} active member{noPin === 1 ? " does" : "s do"} not have a PIN yet.
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Active committees" value={committees} href="/admin/committees" icon={<Building2 />} />
        <StatCard label="Active members" value={activeMembers} href="/admin/members" icon={<Users />} />
        <StatCard label="Upcoming meetings" value={upcoming} href="/admin/meetings" icon={<CalendarDays />} />
        <StatCard label="Meetings (last 30 days)" value={recent} href="/admin/meetings?when=past" icon={<History />} />
        <StatCard label="Minutes awaiting approval" value={awaiting} href="/admin/minutes?tab=progress" icon={<FileClock />} tone={awaiting ? "amber" : "navy"} />
        <StatCard label="Open tasks" value={openTasks} href="/admin/tasks" icon={<ListChecks />} />
        <StatCard label="Overdue tasks" value={overdue} href="/admin/tasks?tab=overdue" icon={<AlertCircle />} tone={overdue ? "red" : "green"} />
        <StatCard label="Docs added (30 days)" value={docs} href="/admin/documents" icon={<FolderOpen />} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ListCard title="Upcoming Meetings" href="/admin/meetings" empty="No upcoming meetings.">
          {upcomingList.map((m) => (
            <Row key={m.id} href={`/admin/meetings/${m.id}`} title={m.title} sub={`${m.committee.name} · ${formatDate(m.meetingDate, "short")}`} />
          ))}
        </ListCard>
        <ListCard title="Minutes in Progress" href="/admin/minutes?tab=progress" empty="Nothing awaiting action.">
          {awaitingList.map((m) => (
            <Row key={m.id} href={`/admin/minutes/${m.id}`} title={`${formatDate(m.meeting.meetingDate, "short")} — ${m.meeting.title}`} sub={m.meeting.committee.name} right={<MinutesStatusBadge status={m.status} />} />
          ))}
        </ListCard>
        <ListCard title="Recent Meetings" href="/admin/meetings?when=past" empty="No past meetings.">
          {recentList.map((m) => (
            <Row key={m.id} href={`/admin/meetings/${m.id}`} title={m.title} sub={`${m.committee.name} · ${formatDate(m.meetingDate, "short")}`} right={m.minutes ? <MinutesStatusBadge status={m.minutes.status} /> : <span className="text-xs text-slate-400">No minutes</span>} />
          ))}
        </ListCard>
        <ListCard title="Recently Uploaded Documents" href="/admin/documents" empty="No documents yet.">
          {recentDocs.map((d) => (
            <Row key={d.id} href={`/admin/documents/${d.id}`} title={d.title} sub={`${d.committee.name} · ${formatDateTime(d.createdAt, org.timezone)}`} />
          ))}
        </ListCard>
      </div>
    </div>
  );
}

function ListCard({ title, href, empty, children }: { title: string; href: string; empty: string; children: React.ReactNode[] }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between"><CardTitle>{title}</CardTitle><Link href={href} className="text-sm font-medium text-navy-700">View all</Link></CardHeader>
      <CardContent>{children.length ? <ul className="divide-y">{children}</ul> : <p className="text-sm text-slate-500">{empty}</p>}</CardContent>
    </Card>
  );
}

function Row({ href, title, sub, right }: { href: string; title: string; sub: string; right?: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center justify-between gap-2 py-2.5 hover:bg-slate-50">
        <div className="min-w-0"><p className="truncate font-medium">{title}</p><p className="truncate text-xs text-slate-500">{sub}</p></div>
        {right}
      </Link>
    </li>
  );
}
