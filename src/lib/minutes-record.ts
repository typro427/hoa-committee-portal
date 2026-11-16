// Normalized, presentation-ready view of a minutes record. Used by the web view, PDF export,
// and to render historical revision snapshots.

export type MinutesRecord = {
  status: string;
  committeeName: string;
  meetingTitle: string;
  meetingDate: string; // ISO
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  chairpersonName: string | null;
  secretaryName: string | null;
  attendance: { name: string; status: string; notes: string | null }[];
  sections: { key: string; label: string; body: string | null }[];
  motions: {
    description: string; movedByName: string | null; secondedByName: string | null;
    votesFor: number; votesAgainst: number; abstentions: number; outcome: string; notes: string | null;
  }[];
  actionItems: { title: string; assignee: string | null; dueDate: string | null; priority: string; status: string }[];
  adjournmentTime: string | null;
  closingNotes: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
};

export const MINUTES_SECTIONS = [
  ["callToOrder", "Call to Order"],
  ["previousMinutes", "Approval of Previous Minutes"],
  ["oldBusiness", "Old Business"],
  ["newBusiness", "New Business"],
  ["committeeReports", "Committee Reports"],
  ["projectUpdates", "Project Updates"],
  ["otherBusiness", "Other Discussions"],
  ["recommendations", "Recommendations"],
] as const;

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

/** Accepts either a live Prisma record (with includes) or a JSON snapshot of one. */
export function toMinutesRecord(m: Any): MinutesRecord {
  const meeting = m.meeting ?? {};
  return {
    status: m.status,
    committeeName: meeting.committee?.name ?? "",
    meetingTitle: meeting.title ?? "",
    meetingDate: iso(meeting.meetingDate) ?? "",
    location: meeting.location ?? null,
    startTime: meeting.startTime ?? null,
    endTime: meeting.endTime ?? null,
    chairpersonName: m.chairpersonName ?? null,
    secretaryName: m.secretaryName ?? null,
    attendance: (meeting.attendance ?? []).map((a: Any) => ({ name: a.attendeeName, status: a.attendanceStatus, notes: a.notes ?? null })),
    sections: MINUTES_SECTIONS.map(([key, label]) => ({ key, label, body: m[key] ?? null })),
    motions: (m.motions ?? []).map((x: Any) => ({
      description: x.description, movedByName: x.movedByName ?? null, secondedByName: x.secondedByName ?? null,
      votesFor: x.votesFor ?? 0, votesAgainst: x.votesAgainst ?? 0, abstentions: x.abstentions ?? 0, outcome: x.outcome, notes: x.notes ?? null,
    })),
    actionItems: (meeting.tasks ?? []).map((t: Any) => ({
      title: t.title,
      assignee: t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : null,
      dueDate: iso(t.dueDate),
      priority: t.priority,
      status: t.status,
    })),
    adjournmentTime: m.adjournmentTime ?? null,
    closingNotes: m.closingNotes ?? null,
    approvedByName: m.approvedByName ?? null,
    approvedAt: iso(m.approvedAt),
    publishedAt: iso(m.publishedAt),
  };
}
