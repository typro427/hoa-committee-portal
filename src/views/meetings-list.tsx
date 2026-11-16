import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List, MapPin, Plus, Clock } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { EmptyState, MeetingStatusBadge, PageHeader, Tabs } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { formatDate, formatTimeRange, isoToDate, MEETING_STATUS_LABELS, MEETING_TYPE_LABELS, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

type SP = { view?: string; month?: string; committee?: string; status?: string; when?: string };

export async function MeetingsListView({ actor, sp }: { actor: Actor; sp: SP }) {
  const base = actor.kind === "admin" ? "/admin/meetings" : "/portal/meetings";
  const org = await getOrganization();
  const today = todayISO(org.timezone);
  const view = sp.view === "calendar" ? "calendar" : "list";
  const committees = actor.kind === "admin" ? await db.committee.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }) : [];

  const where: Prisma.MeetingWhereInput = {
    committeeId: actor.kind === "member" ? actor.committeeId : sp.committee || undefined,
    ...(actor.kind === "admin" ? { committee: { organizationId: org.id } } : {}),
    ...(sp.status && sp.status in MEETING_STATUS_LABELS ? { status: sp.status as never } : {}),
  };
  const canCreate = actor.kind === "admin" || can.manageMeetings(actor, actor.committeeId);
  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${base}?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Meetings"
        description={actor.kind === "admin" ? "All committee meetings" : `${actor.committeeName} meeting schedule`}
        actions={canCreate && (
          <Link href={`${base}/new${sp.committee ? `?committee=${sp.committee}` : ""}`} className={buttonVariants()}>
            <Plus /> New Meeting
          </Link>
        )}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 no-print">
        <div className="flex rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200">
          <Link href={qs({ view: undefined })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === "list" ? "bg-navy-800 text-white" : "text-slate-600")}>
            <List className="size-4" /> List
          </Link>
          <Link href={qs({ view: "calendar" })} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium", view === "calendar" ? "bg-navy-800 text-white" : "text-slate-600")}>
            <CalendarDays className="size-4" /> Calendar
          </Link>
        </div>
        {actor.kind === "admin" && (
          <form className="flex flex-wrap gap-2" action={base}>
            {view === "calendar" && <input type="hidden" name="view" value="calendar" />}
            <Select name="committee" defaultValue={sp.committee ?? ""} className="h-10 w-auto">
              <option value="">All committees</option>
              {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Select name="status" defaultValue={sp.status ?? ""} className="h-10 w-auto">
              <option value="">Any status</option>
              {Object.entries(MEETING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <button className={buttonVariants({ variant: "outline", size: "sm" })}>Filter</button>
          </form>
        )}
      </div>
      {view === "calendar" ? (
        <MonthCalendar where={where} month={sp.month} today={today} base={base} qs={qs} showCommittee={actor.kind === "admin"} />
      ) : (
        <MeetingList where={where} today={today} base={base} when={sp.when === "past" ? "past" : "upcoming"} qs={qs} showCommittee={actor.kind === "admin"} />
      )}
    </>
  );
}

async function MeetingList({ where, today, base, when, qs, showCommittee }: { where: Prisma.MeetingWhereInput; today: string; base: string; when: "upcoming" | "past"; qs: (o: Partial<SP>) => string; showCommittee: boolean }) {
  const t = isoToDate(today);
  const [upcomingCount, pastCount] = await Promise.all([
    db.meeting.count({ where: { ...where, meetingDate: { gte: t } } }),
    db.meeting.count({ where: { ...where, meetingDate: { lt: t } } }),
  ]);
  const meetings = await db.meeting.findMany({
    where: { ...where, meetingDate: when === "upcoming" ? { gte: t } : { lt: t } },
    orderBy: when === "upcoming" ? [{ meetingDate: "asc" }, { startTime: "asc" }] : [{ meetingDate: "desc" }],
    include: { committee: { select: { name: true } }, minutes: { select: { status: true } } },
    take: 200,
  });
  return (
    <>
      <Tabs
        current={when}
        tabs={[
          { key: "upcoming", label: "Upcoming", href: qs({ when: undefined }), count: upcomingCount },
          { key: "past", label: "Past Meetings", href: qs({ when: "past" }), count: pastCount },
        ]}
      />
      {meetings.length === 0 ? (
        <EmptyState>{when === "upcoming" ? "No upcoming meetings are scheduled." : "No past meetings yet."}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {meetings.map((m) => (
            <li key={m.id}>
              <Link href={`${base}/${m.id}`} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-navy-300">
                <DateTile date={m.meetingDate} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-navy-900">{m.title}</p>
                    <MeetingStatusBadge status={m.status} />
                    {m.minutes?.status === "PUBLISHED" && <span className="text-xs font-medium text-emerald-700">Minutes available</span>}
                  </div>
                  {showCommittee && <p className="text-sm font-medium text-navy-600">{m.committee.name}</p>}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    <span>{formatDate(m.meetingDate)}</span>
                    {m.startTime && <span className="inline-flex items-center gap-1"><Clock className="size-3.5" />{formatTimeRange(m.startTime, m.endTime)}</span>}
                    {m.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{m.location}</span>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{MEETING_TYPE_LABELS[m.meetingType]}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function DateTile({ date }: { date: Date }) {
  return (
    <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-navy-50 text-navy-800">
      <span className="text-[11px] font-semibold uppercase">{date.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</span>
      <span className="text-xl font-bold leading-none">{date.getUTCDate()}</span>
    </div>
  );
}

async function MonthCalendar({ where, month, today, base, qs, showCommittee }: { where: Prisma.MeetingWhereInput; month?: string; today: string; base: string; qs: (o: Partial<SP>) => string; showCommittee: boolean }) {
  const [y, mo] = (month && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7)).split("-").map(Number);
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const last = new Date(Date.UTC(y, mo, 0));
  const meetings = await db.meeting.findMany({
    where: { ...where, meetingDate: { gte: first, lte: last } },
    orderBy: [{ meetingDate: "asc" }, { startTime: "asc" }],
    include: { committee: { select: { name: true } } },
  });
  const byDay = new Map<number, typeof meetings>();
  for (const m of meetings) {
    const d = m.meetingDate.getUTCDate();
    byDay.set(d, [...(byDay.get(d) ?? []), m]);
  }
  const lead = first.getUTCDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: last.getUTCDate() }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const prev = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  const todayDay = today.slice(0, 7) === `${y}-${String(mo).padStart(2, "0")}` ? Number(today.slice(8)) : -1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-3 py-3">
        <Link href={qs({ view: "calendar", month: prev })} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Previous month"><ChevronLeft /></Link>
        <h2 className="text-lg font-semibold text-navy-900">{first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
        <Link href={qs({ view: "calendar", month: next })} className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label="Next month"><ChevronRight /></Link>
      </div>
      {/* Grid on larger screens */}
      <div className="hidden sm:block">
        <div className="grid grid-cols-7 border-b text-center text-xs font-semibold uppercase text-slate-500">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => (
            <div key={i} className={cn("min-h-24 border-b border-r p-1.5 text-xs", (i + 1) % 7 === 0 && "border-r-0", !d && "bg-slate-50")}>
              {d && (
                <>
                  <span className={cn("inline-flex size-6 items-center justify-center rounded-full font-semibold", d === todayDay ? "bg-navy-800 text-white" : "text-slate-600")}>{d}</span>
                  <div className="mt-1 flex flex-col gap-1">
                    {(byDay.get(d) ?? []).map((m) => (
                      <Link key={m.id} href={`${base}/${m.id}`} className={cn("block truncate rounded px-1.5 py-1 font-medium", m.status === "CANCELLED" ? "bg-red-50 text-red-700 line-through" : "bg-navy-50 text-navy-800 hover:bg-navy-100")}>
                        {m.startTime && <span className="mr-1 opacity-70">{formatTimeRange(m.startTime)}</span>}
                        {showCommittee ? `${m.committee.name}: ` : ""}{m.title}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Agenda-style list on phones */}
      <div className="sm:hidden">
        {meetings.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No meetings this month.</p>
        ) : (
          <ul className="divide-y">
            {meetings.map((m) => (
              <li key={m.id}>
                <Link href={`${base}/${m.id}`} className="flex items-center gap-3 p-3">
                  <DateTile date={m.meetingDate} />
                  <div className="min-w-0">
                    <p className="font-semibold text-navy-900">{m.title}</p>
                    {showCommittee && <p className="text-sm text-navy-600">{m.committee.name}</p>}
                    <p className="text-sm text-slate-600">{formatTimeRange(m.startTime, m.endTime) || "Time TBD"}</p>
                    <MeetingStatusBadge status={m.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
