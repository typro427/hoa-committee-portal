import "server-only";
import { db } from "@/lib/db";
import { getOrganization } from "@/lib/org";
import { PdfBuilder } from "@/lib/pdf";
import {
  formatDate, isoToDate, MEETING_STATUS_LABELS, MINUTES_STATUS_LABELS, ROLE_LABELS, TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS, todayISO,
} from "@/lib/format";

export const REPORT_TYPES = {
  activity: "Committee Activity Report",
  outstanding: "Outstanding Tasks Report",
  meetings: "Meeting History Report",
  annual: "Annual Committee Report",
  roster: "Committee Roster",
} as const;
export type ReportType = keyof typeof REPORT_TYPES;

export type ReportTable = { heading?: string; columns: { label: string; width: number }[]; rows: string[][] };
export type Report = { title: string; subtitle: string; summary: [string, string][]; tables: ReportTable[] };

export type ReportParams = { committeeId?: string; from: string; to: string };

export function defaultRange(timeZone: string) {
  const y = todayISO(timeZone).slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export async function buildReport(type: ReportType, p: ReportParams): Promise<Report> {
  const org = await getOrganization();
  const from = isoToDate(p.from);
  const toExcl = new Date(isoToDate(p.to).getTime() + 86400_000);
  const committees = await db.committee.findMany({
    where: { organizationId: org.id, ...(p.committeeId ? { id: p.committeeId } : {}) },
    orderBy: { name: "asc" },
  });
  const ids = committees.map((c) => c.id);
  const scopeLabel = p.committeeId ? committees[0]?.name ?? "Committee" : "All committees";
  const subtitle = `${scopeLabel} · ${formatDate(p.from, "short")} – ${formatDate(p.to, "short")}`;
  const today = isoToDate(todayISO(org.timezone));
  const dateRange = { gte: from, lt: toExcl };

  switch (type) {
    case "activity": {
      const rows: string[][] = [];
      let totals = [0, 0, 0, 0];
      for (const c of committees) {
        const [meetings, minutes, docs, done] = await Promise.all([
          db.meeting.findMany({ where: { committeeId: c.id, meetingDate: dateRange, status: "COMPLETED" }, select: { attendance: { select: { attendanceStatus: true } } } }),
          db.meetingMinutes.count({ where: { status: "PUBLISHED", meeting: { committeeId: c.id, meetingDate: dateRange } } }),
          db.document.count({ where: { committeeId: c.id, createdAt: dateRange, removedAt: null } }),
          db.task.count({ where: { committeeId: c.id, status: "COMPLETED", completedAt: dateRange } }),
        ]);
        const present = meetings.map((m) => m.attendance.filter((a) => a.attendanceStatus === "PRESENT").length);
        const avg = present.length ? (present.reduce((a, b) => a + b, 0) / present.length).toFixed(1) : "—";
        rows.push([c.name, String(meetings.length), avg, String(minutes), String(docs), String(done)]);
        totals = [totals[0] + meetings.length, totals[1] + minutes, totals[2] + docs, totals[3] + done];
      }
      return {
        title: REPORT_TYPES.activity, subtitle,
        summary: [["Meetings held", String(totals[0])], ["Minutes published", String(totals[1])], ["Documents uploaded", String(totals[2])], ["Tasks completed", String(totals[3])]],
        tables: [{ columns: [{ label: "Committee", width: 0.3 }, { label: "Meetings held", width: 0.14 }, { label: "Avg. attendance", width: 0.14 }, { label: "Published minutes", width: 0.14 }, { label: "Documents", width: 0.14 }, { label: "Tasks completed", width: 0.14 }], rows }],
      };
    }
    case "outstanding": {
      const tasks = await db.task.findMany({
        where: { committeeId: { in: ids }, status: { notIn: ["COMPLETED", "CANCELLED"] } },
        include: { committee: { select: { name: true } }, assignedMember: { select: { firstName: true, lastName: true } } },
        orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      });
      const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today);
      return {
        title: REPORT_TYPES.outstanding,
        subtitle: `${scopeLabel} · as of ${formatDate(today, "short")}`,
        summary: [["Open tasks", String(tasks.length)], ["Overdue tasks", String(overdue.length)], ["Unassigned", String(tasks.filter((t) => !t.assignedMember).length)]],
        tables: [{
          columns: [{ label: "Task", width: 0.3 }, { label: "Committee", width: 0.18 }, { label: "Assigned to", width: 0.16 }, { label: "Due", width: 0.12 }, { label: "Priority", width: 0.1 }, { label: "Status", width: 0.14 }],
          rows: tasks.map((t) => [
            t.title, t.committee.name, t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : "Unassigned",
            t.dueDate ? `${formatDate(t.dueDate, "short")}${t.dueDate < today ? " (OVERDUE)" : ""}` : "—",
            TASK_PRIORITY_LABELS[t.priority], TASK_STATUS_LABELS[t.status],
          ]),
        }],
      };
    }
    case "meetings": {
      const meetings = await db.meeting.findMany({
        where: { committeeId: { in: ids }, meetingDate: dateRange },
        include: { committee: { select: { name: true } }, attendance: { select: { attendanceStatus: true } }, minutes: { select: { status: true } } },
        orderBy: { meetingDate: "asc" },
      });
      return {
        title: REPORT_TYPES.meetings, subtitle,
        summary: [
          ["Meetings", String(meetings.length)],
          ["Completed", String(meetings.filter((m) => m.status === "COMPLETED").length)],
          ["Cancelled", String(meetings.filter((m) => m.status === "CANCELLED").length)],
          ["With published minutes", String(meetings.filter((m) => m.minutes?.status === "PUBLISHED").length)],
        ],
        tables: [{
          columns: [{ label: "Date", width: 0.13 }, { label: "Committee", width: 0.2 }, { label: "Meeting", width: 0.25 }, { label: "Status", width: 0.12 }, { label: "Present", width: 0.08 }, { label: "Absent", width: 0.08 }, { label: "Minutes", width: 0.14 }],
          rows: meetings.map((m) => [
            formatDate(m.meetingDate, "short"), m.committee.name, m.title, MEETING_STATUS_LABELS[m.status],
            String(m.attendance.filter((a) => a.attendanceStatus === "PRESENT").length),
            String(m.attendance.filter((a) => a.attendanceStatus === "ABSENT" || a.attendanceStatus === "EXCUSED").length),
            m.minutes ? MINUTES_STATUS_LABELS[m.minutes.status] : "None",
          ]),
        }],
      };
    }
    case "annual": {
      const tables: ReportTable[] = [];
      const summary: [string, string][] = [];
      for (const c of committees) {
        const [meetings, minutes, completed, open, projectDocs] = await Promise.all([
          db.meeting.count({ where: { committeeId: c.id, meetingDate: dateRange, status: "COMPLETED" } }),
          db.meetingMinutes.findMany({
            where: { status: "PUBLISHED", meeting: { committeeId: c.id, meetingDate: dateRange } },
            include: { meeting: { select: { meetingDate: true } }, motions: { where: { outcome: "PASSED" } } },
            orderBy: { meeting: { meetingDate: "asc" } },
          }),
          db.task.findMany({ where: { committeeId: c.id, status: "COMPLETED", completedAt: dateRange }, include: { assignedMember: { select: { firstName: true, lastName: true } } }, orderBy: { completedAt: "asc" } }),
          db.task.findMany({ where: { committeeId: c.id, status: { notIn: ["COMPLETED", "CANCELLED"] } }, include: { assignedMember: { select: { firstName: true, lastName: true } } } }),
          db.document.findMany({ where: { committeeId: c.id, category: "PROJECT_DOCUMENTS", createdAt: dateRange, removedAt: null }, select: { title: true, createdAt: true } }),
        ]);
        summary.push([c.name, `${meetings} meetings · ${completed.length} tasks completed · ${open.length} outstanding`]);
        const rows: string[][] = [];
        for (const m of minutes) if (m.projectUpdates?.trim()) rows.push(["Major project update", formatDate(m.meeting.meetingDate, "short"), m.projectUpdates.trim()]);
        for (const d of projectDocs) rows.push(["Project document", formatDate(d.createdAt, "short"), d.title]);
        for (const m of minutes) if (m.recommendations?.trim()) rows.push(["Recommendation", formatDate(m.meeting.meetingDate, "short"), m.recommendations.trim()]);
        for (const m of minutes) for (const mo of m.motions) rows.push(["Accomplishment (motion passed)", formatDate(m.meeting.meetingDate, "short"), mo.description]);
        for (const t of completed) rows.push(["Completed task", t.completedAt ? formatDate(t.completedAt, "short") : "—", `${t.title}${t.assignedMember ? ` — ${t.assignedMember.firstName} ${t.assignedMember.lastName}` : ""}`]);
        for (const t of open) rows.push(["Outstanding task", t.dueDate ? `Due ${formatDate(t.dueDate, "short")}` : "—", `${t.title}${t.assignedMember ? ` — ${t.assignedMember.firstName} ${t.assignedMember.lastName}` : ""}`]);
        tables.push({
          heading: `${c.name} — ${meetings} meetings held`,
          columns: [{ label: "Category", width: 0.25 }, { label: "Date", width: 0.15 }, { label: "Detail", width: 0.6 }],
          rows,
        });
      }
      return { title: REPORT_TYPES.annual, subtitle, summary, tables };
    }
    case "roster": {
      const ms = await db.committeeMembership.findMany({
        where: { committeeId: { in: ids }, isActive: true },
        include: { committee: { select: { name: true } }, member: { select: { firstName: true, lastName: true, email: true, phone: true, status: true, lastLoginAt: true, pinGeneratedAt: true } } },
        orderBy: [{ committee: { name: "asc" } }, { member: { lastName: "asc" } }],
      });
      return {
        title: REPORT_TYPES.roster,
        subtitle: scopeLabel,
        summary: [["Assignments", String(ms.length)]],
        tables: [{
          columns: [{ label: "Committee", width: 0.2 }, { label: "Name", width: 0.18 }, { label: "Role", width: 0.1 }, { label: "Email", width: 0.22 }, { label: "Phone", width: 0.13 }, { label: "Status", width: 0.08 }, { label: "PIN issued", width: 0.09 }],
          rows: ms.map((m) => [
            m.committee.name, `${m.member.firstName} ${m.member.lastName}`, ROLE_LABELS[m.role], m.member.email ?? "", m.member.phone ?? "",
            m.member.status === "ACTIVE" ? "Active" : "Inactive", m.member.pinGeneratedAt ? "Yes" : "No",
          ]),
        }],
      };
    }
  }
}

export function reportToCsv(r: Report): string[][] {
  const out: string[][] = [[r.title], [r.subtitle], []];
  for (const [k, v] of r.summary) out.push([k, v]);
  for (const t of r.tables) {
    out.push([]);
    if (t.heading) out.push([t.heading]);
    out.push(t.columns.map((c) => c.label));
    out.push(...t.rows);
  }
  return out;
}

export async function reportToPdf(r: Report) {
  const org = await getOrganization();
  const pdf = await PdfBuilder.create(org.name, r.title, r.subtitle);
  if (r.summary.length) {
    pdf.heading("Summary");
    pdf.keyValues(r.summary);
  }
  for (const t of r.tables) {
    if (t.heading) pdf.heading(t.heading);
    else pdf.space(6);
    pdf.table(t.columns, t.rows);
  }
  return pdf.toBuffer();
}
