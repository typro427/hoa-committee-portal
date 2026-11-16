import Link from "next/link";
import { CalendarDays, Clock, FileText, FolderOpen, ListChecks, MapPin, ChevronRight, AlertCircle } from "lucide-react";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { can } from "@/lib/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MinutesStatusBadge, PriorityBadge, StatCard } from "@/components/common";
import { formatDate, formatTimeRange, isoToDate, todayISO } from "@/lib/format";
import { DateTile } from "@/views/meetings-list";
import { FileIcon } from "@/views/documents";

export const metadata = { title: "Overview" };

export default async function Dashboard() {
  const actor = await requireMember();
  const org = await getOrganization();
  const today = isoToDate(todayISO(org.timezone));
  const c = actor.committeeId;
  const leadership = can.viewDraftMinutes(actor, c);

  const [committee, chair, upcoming, recentMinutes, myTasks, myOverdue, docs, awaiting] = await Promise.all([
    db.committee.findUniqueOrThrow({ where: { id: c }, select: { name: true, description: true } }),
    db.committeeMembership.findFirst({ where: { committeeId: c, role: "CHAIR", isActive: true }, include: { member: { select: { firstName: true, lastName: true } } } }),
    db.meeting.findMany({ where: { committeeId: c, meetingDate: { gte: today }, status: { in: ["SCHEDULED", "POSTPONED"] } }, orderBy: [{ meetingDate: "asc" }, { startTime: "asc" }], take: 3 }),
    db.meetingMinutes.findMany({ where: { status: "PUBLISHED", meeting: { committeeId: c } }, include: { meeting: { select: { title: true, meetingDate: true } } }, orderBy: { meeting: { meetingDate: "desc" } }, take: 3 }),
    db.task.findMany({ where: { committeeId: c, assignedMemberId: actor.memberId, status: { notIn: ["COMPLETED", "CANCELLED"] } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }], take: 5 }),
    db.task.count({ where: { committeeId: c, assignedMemberId: actor.memberId, status: { notIn: ["COMPLETED", "CANCELLED"] }, dueDate: { lt: today } } }),
    db.document.findMany({ where: { committeeId: c, removedAt: null, taskId: null }, orderBy: { createdAt: "desc" }, take: 4 }),
    leadership ? db.meetingMinutes.findMany({ where: { meeting: { committeeId: c }, status: { not: "PUBLISHED" } }, include: { meeting: { select: { meetingDate: true, title: true } } }, take: 5 }) : [],
  ]);
  const docsLast30 = await db.document.count({ where: { committeeId: c, removedAt: null, taskId: null, createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } } });
  const next = upcoming[0];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-navy-900">{committee.name}</h1>
        <p className="text-slate-600">
          Welcome back, {actor.name.split(" ")[0]}.{chair && <> Committee chair: <span className="font-medium">{chair.member.firstName} {chair.member.lastName}</span></>}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Upcoming meeting" value={next ? monthDay(next.meetingDate) : "None"} href={next ? `/portal/meetings/${next.id}` : "/portal/meetings"} icon={<CalendarDays />} />
        <StatCard label="My outstanding tasks" value={myTasks.length} href="/portal/tasks" icon={<ListChecks />} tone={myOverdue ? "red" : "navy"} />
        <StatCard label="Recent minutes" value={recentMinutes[0] ? monthDay(recentMinutes[0].meeting.meetingDate) : "None"} href="/portal/minutes" icon={<FileText />} />
        <StatCard label="Docs added (30 days)" value={docsLast30} href="/portal/documents" icon={<FolderOpen />} />
      </div>

      {awaiting.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader><CardTitle>Minutes in progress</CardTitle></CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {awaiting.map((m) => (
                <li key={m.id}>
                  <Link href={`/portal/minutes/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 ring-1 ring-blue-100">
                    <span className="font-medium">{formatDate(m.meeting.meetingDate, "short")} — {m.meeting.title}</span>
                    <MinutesStatusBadge status={m.status} />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Next Meeting</CardTitle></CardHeader>
          <CardContent>
            {next ? (
              <Link href={`/portal/meetings/${next.id}`} className="flex gap-4">
                <DateTile date={next.meetingDate} />
                <div className="text-sm">
                  <p className="text-base font-semibold text-navy-900">{next.title}</p>
                  <p className="text-slate-600">{formatDate(next.meetingDate)}</p>
                  {next.startTime && <p className="flex items-center gap-1 text-slate-600"><Clock className="size-4" />{formatTimeRange(next.startTime, next.endTime)}</p>}
                  {next.location && <p className="flex items-center gap-1 text-slate-600"><MapPin className="size-4" />{next.location}</p>}
                </div>
              </Link>
            ) : (
              <p className="text-sm text-slate-500">No meetings are scheduled right now.</p>
            )}
            {upcoming.length > 1 && (
              <ul className="mt-4 border-t pt-3 text-sm">
                {upcoming.slice(1).map((m) => (
                  <li key={m.id}><Link href={`/portal/meetings/${m.id}`} className="flex justify-between py-1 hover:underline"><span>{m.title}</span><span className="text-slate-500">{formatDate(m.meetingDate, "short")}</span></Link></li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>My Outstanding Tasks</CardTitle>
            <Link href="/portal/tasks" className="text-sm font-medium text-navy-700">View all</Link>
          </CardHeader>
          <CardContent>
            {myTasks.length === 0 ? (
              <p className="text-sm text-slate-500">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {myTasks.map((t) => {
                  const overdue = t.dueDate && t.dueDate < today;
                  return (
                    <li key={t.id}>
                      <Link href={`/portal/tasks/${t.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{t.title}</p>
                          <p className={overdue ? "flex items-center gap-1 text-xs font-semibold text-red-700" : "text-xs text-slate-500"}>
                            {overdue && <AlertCircle className="size-3.5" />}{t.dueDate ? `${overdue ? "Overdue · " : "Due "}${formatDate(t.dueDate, "short")}` : "No due date"}
                          </p>
                        </div>
                        <PriorityBadge priority={t.priority} />
                        <ChevronRight className="size-4 text-slate-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Meeting Minutes</CardTitle>
            <Link href="/portal/minutes" className="text-sm font-medium text-navy-700">View all</Link>
          </CardHeader>
          <CardContent>
            {recentMinutes.length === 0 ? <p className="text-sm text-slate-500">No minutes have been published yet.</p> : (
              <ul className="flex flex-col gap-2">
                {recentMinutes.map((m) => (
                  <li key={m.id}>
                    <Link href={`/portal/minutes/${m.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50">
                      <FileText className="size-5 text-navy-600" />
                      <div className="min-w-0"><p className="font-medium">{formatDate(m.meeting.meetingDate, "medium")}</p><p className="truncate text-xs text-slate-500">{m.meeting.title}</p></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recently Added Documents</CardTitle>
            <Link href="/portal/documents" className="text-sm font-medium text-navy-700">View all</Link>
          </CardHeader>
          <CardContent>
            {docs.length === 0 ? <p className="text-sm text-slate-500">No documents yet.</p> : (
              <ul className="flex flex-col gap-2">
                {docs.map((d) => (
                  <li key={d.id}>
                    <Link href={`/portal/documents/${d.id}`} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-slate-50">
                      <FileIcon mime={d.mimeType} className="size-5" />
                      <div className="min-w-0"><p className="truncate font-medium">{d.title}</p><p className="text-xs text-slate-500">{formatDate(d.createdAt, "short")}</p></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {committee.description && <p className="text-sm text-slate-500">{committee.description}</p>}
    </div>
  );
}

function monthDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
