import "server-only";
import { PdfBuilder } from "@/lib/pdf";
import type { MinutesRecord } from "@/lib/minutes-record";
import {
  AGENDA_SECTION_LABELS, formatDate, formatDateTime, formatTime, formatTimeRange,
  MEETING_TYPE_LABELS, MINUTES_STATUS_LABELS, MOTION_OUTCOME_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS,
} from "@/lib/format";
import { sortAgenda } from "@/lib/agenda";

type Carry = { title: string; assignee: string | null; dueDate: string | null; status: string };

export async function buildMinutesPdf(orgName: string, r: MinutesRecord, carried: Carry[], timeZone: string) {
  const status = r.status === "PUBLISHED" ? "" : ` (${MINUTES_STATUS_LABELS[r.status as keyof typeof MINUTES_STATUS_LABELS].toUpperCase()} - NOT OFFICIAL)`;
  const pdf = await PdfBuilder.create(orgName, `${r.committeeName}`, `Meeting Minutes - ${formatDate(r.meetingDate)}${status}`);
  pdf.keyValues([
    ["Meeting", r.meetingTitle],
    ["Date", formatDate(r.meetingDate)],
    ["Time", formatTimeRange(r.startTime, r.endTime) || "-"],
    ["Location", r.location],
    ["Chairperson", r.chairpersonName],
    ["Secretary", r.secretaryName],
  ]);
  pdf.heading("Attendance");
  const by = (s: string[]) => r.attendance.filter((a) => s.includes(a.status));
  pdf.keyValues([
    ["Members present", by(["PRESENT"]).map((a) => a.name).join(", ") || "Not recorded"],
    ["Members absent", by(["ABSENT", "EXCUSED"]).map((a) => a.name + (a.status === "EXCUSED" ? " (excused)" : "")).join(", ") || "None"],
    ["Guests", by(["GUEST"]).map((a) => a.name + (a.notes ? ` (${a.notes})` : "")).join(", ") || "None"],
  ]);
  for (const s of r.sections) {
    pdf.heading(s.label);
    pdf.paragraph(s.body);
  }
  pdf.heading("Motions and Voting");
  if (r.motions.length === 0) pdf.paragraph("No motions were recorded.");
  r.motions.forEach((m, i) => {
    pdf.paragraph(`${i + 1}. ${m.description}`, { bold: true });
    pdf.paragraph(
      `Moved by ${m.movedByName ?? "-"}; seconded by ${m.secondedByName ?? "-"}. Vote: ${m.votesFor} for, ${m.votesAgainst} against, ${m.abstentions} abstaining. Outcome: ${MOTION_OUTCOME_LABELS[m.outcome as keyof typeof MOTION_OUTCOME_LABELS]}.${m.notes ? " " + m.notes : ""}`,
      { indent: 14 },
    );
  });
  pdf.heading("Action Items");
  pdf.table(
    [{ label: "Task", width: 0.42 }, { label: "Assigned to", width: 0.2 }, { label: "Due", width: 0.14 }, { label: "Priority", width: 0.1 }, { label: "Status", width: 0.14 }],
    r.actionItems.map((t) => [t.title, t.assignee ?? "Unassigned", t.dueDate ? formatDate(t.dueDate, "short") : "-", TASK_PRIORITY_LABELS[t.priority as keyof typeof TASK_PRIORITY_LABELS], TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]]),
  );
  if (carried.length) {
    pdf.paragraph("Open items carried forward from earlier meetings:", { bold: true });
    pdf.table(
      [{ label: "Task", width: 0.5 }, { label: "Assigned to", width: 0.22 }, { label: "Due", width: 0.14 }, { label: "Status", width: 0.14 }],
      carried.map((t) => [t.title, t.assignee ?? "Unassigned", t.dueDate ? formatDate(t.dueDate, "short") : "-", TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]]),
    );
  }
  pdf.heading("Adjournment");
  pdf.paragraph(r.adjournmentTime ? `The meeting was adjourned at ${formatTime(r.adjournmentTime)}.` : "Adjournment time not recorded.");
  if (r.closingNotes) pdf.paragraph(r.closingNotes);
  pdf.heading("Approval");
  pdf.keyValues([
    ["Approved by", r.approvedByName ?? "Not yet approved"],
    ["Approval date", r.approvedAt ? formatDateTime(new Date(r.approvedAt), timeZone) : "-"],
    ["Chairperson", r.chairpersonName],
    ["Published", r.publishedAt ? formatDateTime(new Date(r.publishedAt), timeZone) : "Not published"],
  ]);
  return pdf.toBuffer();
}

type AgendaMeeting = {
  title: string; meetingDate: Date; startTime: string | null; endTime: string | null; location: string | null; meetingType: string;
  description: string | null; committee: { name: string };
  agendaItems: { section: string; title: string; description: string | null; displayOrder: number; documents: { title: string }[] }[];
};

export async function buildAgendaPdf(orgName: string, m: AgendaMeeting) {
  const pdf = await PdfBuilder.create(orgName, m.committee.name, `Meeting Agenda - ${formatDate(m.meetingDate)}`);
  pdf.keyValues([
    ["Meeting", m.title],
    ["Type", MEETING_TYPE_LABELS[m.meetingType as keyof typeof MEETING_TYPE_LABELS]],
    ["Date", formatDate(m.meetingDate)],
    ["Time", formatTimeRange(m.startTime, m.endTime) || "-"],
    ["Location", m.location],
  ]);
  if (m.description) pdf.paragraph(m.description);
  const items = sortAgenda(m.agendaItems);
  if (!items.length) {
    pdf.heading("Agenda");
    pdf.paragraph("The agenda has not been posted yet.");
  }
  const sections = [...new Set(items.map((i) => i.section))];
  sections.forEach((s, idx) => {
    pdf.heading(`${idx + 1}. ${AGENDA_SECTION_LABELS[s as keyof typeof AGENDA_SECTION_LABELS]}`);
    for (const i of items.filter((x) => x.section === s)) {
      if (i.title !== AGENDA_SECTION_LABELS[s as keyof typeof AGENDA_SECTION_LABELS]) pdf.paragraph(i.title, { bold: true });
      if (i.description) pdf.paragraph(i.description, { indent: 12 });
      if (i.documents.length) pdf.paragraph(`Attachments: ${i.documents.map((d) => d.title).join(", ")}`, { indent: 12, size: 9 });
    }
  });
  return pdf.toBuffer();
}

