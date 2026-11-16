import { ATTENDANCE_LABELS, formatDate, formatDateTime, formatTime, formatTimeRange, MOTION_OUTCOME_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/format";
import type { MinutesRecord } from "@/lib/minutes-record";

type CarryItem = { title: string; assignee: string | null; dueDate: string | null; status: string };

/** Read-only, print-friendly rendering of a minutes record. */
export function MinutesDocument({ r, carried = [], timeZone }: { r: MinutesRecord; carried?: CarryItem[]; timeZone: string }) {
  const present = r.attendance.filter((a) => a.status === "PRESENT");
  const absent = r.attendance.filter((a) => a.status === "ABSENT" || a.status === "EXCUSED");
  const guests = r.attendance.filter((a) => a.status === "GUEST");
  return (
    <article className="print-area rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      <header className="border-b-2 border-navy-800 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{r.committeeName}</p>
        <h2 className="text-xl font-bold text-navy-900">Meeting Minutes</h2>
        <p className="text-slate-700">{r.meetingTitle}</p>
      </header>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Info label="Date" value={r.meetingDate ? formatDate(r.meetingDate) : "—"} />
        <Info label="Time" value={formatTimeRange(r.startTime, r.endTime) || "—"} />
        <Info label="Location" value={r.location ?? "—"} />
        <Info label="Chairperson" value={r.chairpersonName ?? "—"} />
        <Info label="Secretary" value={r.secretaryName ?? "—"} />
      </dl>

      <H>Attendance</H>
      <dl className="grid gap-2 text-sm">
        <Info label="Members present" value={present.map((a) => a.name).join(", ") || "Not recorded"} />
        <Info label="Members absent" value={absent.map((a) => a.name + (a.status === "EXCUSED" ? ` (${ATTENDANCE_LABELS.EXCUSED.toLowerCase()})` : "")).join(", ") || "None"} />
        {guests.length > 0 && <Info label="Guests / additional attendees" value={guests.map((g) => g.name + (g.notes ? ` (${g.notes})` : "")).join(", ")} />}
      </dl>

      {r.sections.map((s) => (
        <div key={s.key}>
          <H>{s.label}</H>
          <p className="prose-minutes">{s.body?.trim() || <span className="text-slate-400">None recorded.</span>}</p>
        </div>
      ))}

      <H>Motions and Voting</H>
      {r.motions.length === 0 ? (
        <p className="text-sm text-slate-400">No motions were recorded.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {r.motions.map((m, i) => (
            <li key={i} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{i + 1}. {m.description}</p>
              <p className="mt-1 text-slate-600">
                Moved by {m.movedByName ?? "—"} · Seconded by {m.secondedByName ?? "—"}
              </p>
              <p className="text-slate-600">
                Vote: {m.votesFor} for, {m.votesAgainst} against, {m.abstentions} abstaining ·{" "}
                <span className="font-semibold text-navy-800">{MOTION_OUTCOME_LABELS[m.outcome as keyof typeof MOTION_OUTCOME_LABELS]}</span>
              </p>
              {m.notes && <p className="mt-1 text-slate-600">{m.notes}</p>}
            </li>
          ))}
        </ol>
      )}

      <H>Action Items</H>
      <ActionTable items={r.actionItems} />
      {carried.length > 0 && (
        <>
          <p className="mt-4 text-sm font-semibold text-slate-700">Open items carried forward from earlier meetings</p>
          <ActionTable items={carried.map((c) => ({ ...c, priority: "" }))} />
        </>
      )}

      <H>Adjournment</H>
      <p className="text-sm">{r.adjournmentTime ? `The meeting was adjourned at ${formatTime(r.adjournmentTime) || r.adjournmentTime}.` : "Adjournment time not recorded."}</p>
      {r.closingNotes && <p className="prose-minutes mt-2">{r.closingNotes}</p>}

      {(r.approvedAt || r.publishedAt) && (
        <footer className="mt-6 border-t pt-4 text-sm text-slate-600">
          {r.approvedAt && <p>Approved by {r.approvedByName ?? "—"} on {formatDateTime(new Date(r.approvedAt), timeZone)}</p>}
          {r.publishedAt && <p>Published {formatDateTime(new Date(r.publishedAt), timeZone)}</p>}
        </footer>
      )}
    </article>
  );
}

function ActionTable({ items }: { items: { title: string; assignee: string | null; dueDate: string | null; priority: string; status: string }[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-400">No action items.</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {items.map((t, i) => (
        <li key={i} className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-medium">{t.title}</span>
          <span className="text-slate-600">
            {t.assignee ?? "Unassigned"}
            {t.dueDate ? ` · Due ${formatDate(t.dueDate, "short")}` : ""}
            {t.priority ? ` · ${TASK_PRIORITY_LABELS[t.priority as keyof typeof TASK_PRIORITY_LABELS]}` : ""}
            {` · ${TASK_STATUS_LABELS[t.status as keyof typeof TASK_STATUS_LABELS]}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-6 border-b border-slate-200 pb-1 text-base font-semibold text-navy-900">{children}</h3>;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline font-semibold text-slate-700">{label}: </dt>
      <dd className="inline text-slate-700">{value}</dd>
    </div>
  );
}
