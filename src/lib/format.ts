// Shared formatting helpers and human-readable labels (safe for client and server).

export const MEETING_TYPE_LABELS = {
  REGULAR: "Regular Meeting",
  SPECIAL: "Special Meeting",
  ANNUAL_PLANNING: "Annual Planning Meeting",
  EMERGENCY: "Emergency Meeting",
  OTHER: "Other",
} as const;

export const MEETING_STATUS_LABELS = {
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  POSTPONED: "Postponed",
} as const;

export const MINUTES_STATUS_LABELS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted for Review",
  CHANGES_REQUESTED: "Returned for Corrections",
  APPROVED: "Approved",
  PUBLISHED: "Published",
} as const;

export const TASK_STATUS_LABELS = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  WAITING_ON_INFORMATION: "Waiting on Information",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

export const TASK_PRIORITY_LABELS = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
} as const;

export const DOCUMENT_CATEGORY_LABELS = {
  MEETING_DOCUMENTS: "Meeting Documents",
  FINANCIAL_REPORTS: "Financial Reports",
  VENDOR_QUOTES: "Vendor Quotes",
  PROJECT_DOCUMENTS: "Project Documents",
  POLICIES_AND_PROCEDURES: "Policies and Procedures",
  GENERAL: "General Committee Documents",
  ARCHIVED: "Archived Documents",
} as const;

export const AGENDA_SECTION_LABELS = {
  CALL_TO_ORDER: "Call to Order",
  ROLL_CALL: "Roll Call",
  APPROVAL_OF_PREVIOUS_MINUTES: "Approval of Previous Minutes",
  OLD_BUSINESS: "Old Business",
  NEW_BUSINESS: "New Business",
  COMMITTEE_REPORTS: "Committee Reports",
  PROJECT_UPDATES: "Project Updates",
  RECOMMENDATIONS: "Recommendations",
  OTHER_BUSINESS: "Other Business",
  ADJOURNMENT: "Adjournment",
} as const;
export const AGENDA_SECTIONS = Object.keys(AGENDA_SECTION_LABELS) as (keyof typeof AGENDA_SECTION_LABELS)[];

export const ROLE_LABELS = { CHAIR: "Chair", SECRETARY: "Secretary", MEMBER: "Member" } as const;

export const ATTENDANCE_LABELS = { PRESENT: "Present", ABSENT: "Absent", EXCUSED: "Excused", GUEST: "Guest" } as const;

export const MOTION_OUTCOME_LABELS = { PASSED: "Passed", FAILED: "Failed", TABLED: "Tabled", WITHDRAWN: "Withdrawn" } as const;

/** Date-only columns are stored at UTC midnight; always format them in UTC. */
export function formatDate(d: Date | string | null | undefined, style: "long" | "short" | "medium" = "long") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const opts: Intl.DateTimeFormatOptions =
    style === "long"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
      : style === "medium"
        ? { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }
        : { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-US", opts).format(date);
}

export function formatDateTime(d: Date | null | undefined, timeZone = "America/New_York") {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone,
  }).format(d);
}

export function formatTime(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:${String(m ?? 0).padStart(2, "0")} ${suffix}`;
}

export function formatTimeRange(start?: string | null, end?: string | null) {
  if (!start) return "";
  return end ? `${formatTime(start)} – ${formatTime(end)}` : formatTime(start);
}

/** YYYY-MM-DD for "today" in the organization's timezone. */
export function todayISO(timeZone = "America/New_York") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function dateToISO(d: Date | null | undefined) {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function isoToDate(s: string) {
  return new Date(`${s}T00:00:00.000Z`);
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fullName(p: { firstName: string; lastName: string } | null | undefined) {
  return p ? `${p.firstName} ${p.lastName}` : "—";
}
