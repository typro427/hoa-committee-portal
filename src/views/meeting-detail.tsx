import Link from "next/link";
import { Clock, FileDown, FileText, MapPin, Pencil, Plus, CalendarDays, Video } from "lucide-react";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MeetingStatusBadge, MinutesStatusBadge, PageHeader, PriorityBadge, ScopeInput, Section, TaskStatusBadge } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Options, Select } from "@/components/ui/form";
import { formatDate, formatTimeRange, MEETING_STATUS_LABELS, MEETING_TYPE_LABELS } from "@/lib/format";
import { setMeetingStatus } from "@/server/meeting-actions";
import { startMinutes } from "@/server/zoom-actions";
import { committeeRoster, loadMeeting } from "@/server/loaders";
import { AgendaEditor, AgendaView, AttendanceEditor, AttendanceView, DocList, UploadForm } from "./meeting-parts";

export async function MeetingDetailView({ actor, id }: { actor: Actor; id: string }) {
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const m = await loadMeeting(actor, id);
  const c = m.committeeId;
  const canManage = can.manageMeetings(actor, c);
  const canAgenda = can.manageAgenda(actor, c);
  const leadership = can.recordAttendance(actor, c);
  const minutesVisible = m.minutes && (m.minutes.status === "PUBLISHED" || can.viewDraftMinutes(actor, c));
  const roster = leadership ? await committeeRoster(c) : [];
  const attendanceLocked = m.minutes && m.minutes.status !== "DRAFT" && m.minutes.status !== "CHANGES_REQUESTED" && !can.reviewMinutes(actor, c);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `${base}/meetings`, label: "Meetings" }}
        title={m.title}
        description={
          <div className="flex flex-col gap-1">
            {actor.kind === "admin" && <span className="font-medium text-navy-700">{m.committee.name}</span>}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <MeetingStatusBadge status={m.status} />
              <span className="inline-flex items-center gap-1"><CalendarDays className="size-4" />{formatDate(m.meetingDate)}</span>
              {m.startTime && <span className="inline-flex items-center gap-1"><Clock className="size-4" />{formatTimeRange(m.startTime, m.endTime)}</span>}
              {m.location && <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{m.location}</span>}
            </div>
            <span className="text-xs text-slate-500">{MEETING_TYPE_LABELS[m.meetingType]}</span>
          </div>
        }
        actions={
          <>
            <a href={`/api/meetings/${m.id}/agenda-pdf`} className={buttonVariants({ variant: "outline" })}><FileDown /> Agenda PDF</a>
            {canManage && <Link href={`${base}/meetings/${m.id}/edit`} className={buttonVariants({ variant: "secondary" })}><Pencil /> Edit</Link>}
          </>
        }
      />

      {canManage && (
        <ActionForm action={setMeetingStatus} className="flex flex-wrap items-center gap-2 rounded-xl border bg-white p-3 shadow-sm">
          <ScopeInput scope={scope} />
          <input type="hidden" name="meetingId" value={m.id} />
          <label htmlFor="status" className="text-sm font-medium text-slate-700">Meeting status</label>
          <Select id="status" name="status" defaultValue={m.status} className="h-10 w-auto"><Options labels={MEETING_STATUS_LABELS} /></Select>
          <SubmitButton size="sm" variant="secondary">Update</SubmitButton>
        </ActionForm>
      )}

      {(m.description || m.notes) && (
        <Section title="Details">
          {m.description && <p className="prose-minutes">{m.description}</p>}
          {m.notes && <p className="prose-minutes mt-3 text-sm text-slate-600"><span className="font-semibold">Notes: </span>{m.notes}</p>}
        </Section>
      )}

      <Section title="Meeting Minutes">
        {m.minutes && minutesVisible ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2"><FileText className="size-5 text-navy-600" /><MinutesStatusBadge status={m.minutes.status} /></div>
            <Link href={`${base}/minutes/${m.minutes.id}`} className={buttonVariants()}>
              {m.minutes.status === "PUBLISHED" ? "View minutes" : "Open minutes"}
            </Link>
          </div>
        ) : !m.minutes && can.createMinutes(actor, c) ? (
          <ActionForm action={startMinutes} className="flex flex-wrap items-center justify-between gap-3">
            <ScopeInput scope={scope} />
            <input type="hidden" name="meetingId" value={m.id} />
            <p className="text-sm text-slate-600">Minutes haven&apos;t been started for this meeting.</p>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="then" value="zoom" pendingText="Creating…"><Video /> Start from Zoom notes</SubmitButton>
              <SubmitButton name="then" value="edit" variant="outline" pendingText="Creating…"><Plus /> Start minutes</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-slate-500">Minutes for this meeting have not been published yet.</p>
        )}
      </Section>

      <Section title="Agenda">
        {canAgenda ? <AgendaEditor scope={scope} meetingId={m.id} items={m.agendaItems} /> : <AgendaView items={m.agendaItems} />}
      </Section>

      <Section title="Attendance">
        {leadership && !attendanceLocked ? (
          <AttendanceEditor scope={scope} meetingId={m.id} roster={roster} attendance={m.attendance} />
        ) : (
          <AttendanceView attendance={m.attendance} />
        )}
      </Section>

      <Section title="Meeting Documents">
        <DocList docs={m.documents} base={base} />
        {can.manageDocuments(actor, c) && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-navy-700">Upload a meeting document</summary>
            <div className="mt-3"><UploadForm scope={scope} hidden={{ meetingId: m.id }} /></div>
          </details>
        )}
      </Section>

      {m.tasks.length > 0 && (
        <Section title="Action Items from this Meeting">
          <ul className="divide-y rounded-lg border">
            {m.tasks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  {can.viewAllCommitteeTasks(actor, c) || (actor.kind === "member" && t.assignedMemberId === actor.memberId) ? (
                    <Link href={`${base}/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                  ) : (
                    <span className="font-medium">{t.title}</span>
                  )}
                  <p className="text-xs text-slate-500">
                    {t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : "Unassigned"}
                    {t.dueDate ? ` · Due ${formatDate(t.dueDate, "short")}` : ""}
                  </p>
                </div>
                <div className="flex gap-1"><PriorityBadge priority={t.priority} /><TaskStatusBadge status={t.status} /></div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
