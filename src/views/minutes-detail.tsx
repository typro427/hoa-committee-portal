import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileDown, History, Pencil, Send, Trash2, Undo2, Eye } from "lucide-react";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { db } from "@/lib/db";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MinutesStatusBadge, PageHeader, ScopeInput, Section } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { PrintButton } from "@/components/print-button";
import { formatDate, formatDateTime, MOTION_OUTCOME_LABELS, TASK_PRIORITY_LABELS } from "@/lib/format";
import { MINUTES_SECTIONS, toMinutesRecord } from "@/lib/minutes-record";
import { addMotion, approveMinutes, deleteMotion, publishMinutes, returnMinutes, saveMinutes, submitMinutes } from "@/server/minutes-actions";
import { saveTask } from "@/server/task-actions";
import { carriedForwardTasks, committeeRoster, loadMinutes } from "@/server/loaders";
import { MinutesDocument } from "./minutes-document";
import { AttendanceEditor } from "./meeting-parts";

export async function MinutesDetailView({ actor, id, editRequested }: { actor: Actor; id: string; editRequested: boolean }) {
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const org = await getOrganization();
  const m = await loadMinutes(actor, id);
  const c = m.meeting.committeeId;
  const s = m.status;

  const canEditNow =
    ((s === "DRAFT" || s === "CHANGES_REQUESTED") && can.editDraftMinutes(actor, c)) ||
    ((s === "SUBMITTED" || s === "APPROVED") && can.reviewMinutes(actor, c)) ||
    (s === "PUBLISHED" && can.amendPublishedMinutes(actor, c) && editRequested);
  const canAmend = s === "PUBLISHED" && can.amendPublishedMinutes(actor, c);
  const record = toMinutesRecord(m);
  const carried = await carriedForwardTasks(c, m.meetingId, m.meeting.meetingDate);
  const roster = canEditNow ? await committeeRoster(c) : [];
  const revisions = actor.kind === "admin"
    ? await db.meetingMinuteRevision.findMany({ where: { minutesId: m.id }, orderBy: { revisionNumber: "desc" }, select: { id: true, revisionNumber: true, changedByName: true, changeReason: true, createdAt: true } })
    : [];
  const preparedBy = m.preparedBy ? `${m.preparedBy.firstName} ${m.preparedBy.lastName}` : m.preparedByAdmin ? `${m.preparedByAdmin.name} (Admin)` : "—";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `${base}/minutes`, label: "Meeting Minutes" }}
        title={`Minutes — ${formatDate(m.meeting.meetingDate, "medium")}`}
        description={
          <div className="flex flex-wrap items-center gap-2">
            <MinutesStatusBadge status={s} />
            <Link href={`${base}/meetings/${m.meetingId}`} className="font-medium text-navy-700 hover:underline">{m.meeting.title}</Link>
            {actor.kind === "admin" && <span>· {m.meeting.committee.name}</span>}
          </div>
        }
        actions={
          <>
            <a href={`/api/minutes/${m.id}/pdf`} className={buttonVariants({ variant: "outline" })}><FileDown /> {s === "PUBLISHED" ? "Download PDF" : "Draft PDF"}</a>
            <PrintButton />
            {canAmend && !editRequested && (
              <Link href={`${base}/minutes/${m.id}?edit=1`} className={buttonVariants({ variant: "secondary" })}><Pencil /> Amend</Link>
            )}
            {canAmend && editRequested && (
              <Link href={`${base}/minutes/${m.id}`} className={buttonVariants({ variant: "secondary" })}><Eye /> Done amending</Link>
            )}
          </>
        }
      />

      {s === "CHANGES_REQUESTED" && m.reviewComments && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Returned for corrections</p>
            <p className="prose-minutes text-sm">{m.reviewComments}</p>
          </div>
        </div>
      )}

      {s !== "PUBLISHED" && <WorkflowPanel actor={actor} scope={scope} minutesId={m.id} status={s} committeeId={c} preparedBy={preparedBy} submittedAt={m.submittedAt} timeZone={org.timezone} />}

      {s === "PUBLISHED" && editRequested && canAmend && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          You are amending published minutes. Every change is saved as a new revision with your name, the time, and your reason.
        </div>
      )}

      {canEditNow ? (
        <>
          <Section title="Minutes">
            <ActionForm action={saveMinutes} className="grid gap-4 sm:grid-cols-2">
              <ScopeInput scope={scope} />
              <input type="hidden" name="minutesId" value={m.id} />
              <Field label="Chairperson" htmlFor="chairpersonName"><Input id="chairpersonName" name="chairpersonName" defaultValue={m.chairpersonName ?? ""} /></Field>
              <Field label="Secretary" htmlFor="secretaryName"><Input id="secretaryName" name="secretaryName" defaultValue={m.secretaryName ?? ""} /></Field>
              {MINUTES_SECTIONS.map(([key, label]) => (
                <Field key={key} label={label} htmlFor={key} className="sm:col-span-2">
                  <Textarea id={key} name={key} rows={key === "callToOrder" || key === "previousMinutes" ? 2 : 4} defaultValue={(m as unknown as Record<string, string | null>)[key] ?? ""} />
                </Field>
              ))}
              <Field label="Adjournment time" htmlFor="adjournmentTime"><Input id="adjournmentTime" name="adjournmentTime" type="time" defaultValue={m.adjournmentTime ?? ""} /></Field>
              <Field label="Closing notes" htmlFor="closingNotes" className="sm:col-span-2"><Textarea id="closingNotes" name="closingNotes" rows={2} defaultValue={m.closingNotes ?? ""} /></Field>
              {s === "PUBLISHED" && (
                <Field label="Reason for amendment (required)" htmlFor="changeReason" className="sm:col-span-2">
                  <Input id="changeReason" name="changeReason" required maxLength={1000} placeholder="e.g. Corrected vote count on motion 2" />
                </Field>
              )}
              <div className="sm:col-span-2"><SubmitButton>{s === "PUBLISHED" ? "Save Amendment" : "Save Minutes"}</SubmitButton></div>
            </ActionForm>
          </Section>

          <Section title="Attendance">
            <AttendanceEditor scope={scope} meetingId={m.meetingId} roster={roster} attendance={m.meeting.attendance} />
          </Section>

          <Section title="Motions and Voting">
            {m.motions.length > 0 && (
              <ol className="mb-4 flex flex-col gap-2">
                {m.motions.map((mo, i) => (
                  <li key={mo.id} className="flex items-start gap-2 rounded-lg border p-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{i + 1}. {mo.description}</p>
                      <p className="text-slate-600">Moved: {mo.movedByName ?? "—"} · Seconded: {mo.secondedByName ?? "—"}</p>
                      <p className="text-slate-600">{mo.votesFor}–{mo.votesAgainst}–{mo.abstentions} · <b>{MOTION_OUTCOME_LABELS[mo.outcome]}</b>{mo.notes ? ` · ${mo.notes}` : ""}</p>
                    </div>
                    <ActionForm action={deleteMotion} confirm="Remove this motion?" showMessages={false}>
                      <ScopeInput scope={scope} />
                      <input type="hidden" name="motionId" value={mo.id} />
                      <Button variant="ghost" size="icon" aria-label="Remove motion"><Trash2 className="text-red-600" /></Button>
                    </ActionForm>
                  </li>
                ))}
              </ol>
            )}
            <ActionForm action={addMotion} resetOnSuccess className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
              <ScopeInput scope={scope} />
              <input type="hidden" name="minutesId" value={m.id} />
              <p className="font-semibold text-navy-900 sm:col-span-2">Record a motion</p>
              <Field label="Motion" htmlFor="mo-desc" className="sm:col-span-2"><Textarea id="mo-desc" name="description" rows={2} required /></Field>
              <Field label="Moved by" htmlFor="mo-moved">
                <Select id="mo-moved" name="movedById" defaultValue=""><option value="">—</option>{roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
              </Field>
              <Field label="Seconded by" htmlFor="mo-second">
                <Select id="mo-second" name="secondedById" defaultValue=""><option value="">—</option>{roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
              </Field>
              <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                <Field label="For" htmlFor="mo-for"><Input id="mo-for" name="votesFor" type="number" min={0} inputMode="numeric" defaultValue={0} /></Field>
                <Field label="Against" htmlFor="mo-against"><Input id="mo-against" name="votesAgainst" type="number" min={0} inputMode="numeric" defaultValue={0} /></Field>
                <Field label="Abstain" htmlFor="mo-abs"><Input id="mo-abs" name="abstentions" type="number" min={0} inputMode="numeric" defaultValue={0} /></Field>
              </div>
              <Field label="Outcome" htmlFor="mo-outcome"><Select id="mo-outcome" name="outcome" defaultValue="PASSED"><Options labels={MOTION_OUTCOME_LABELS} /></Select></Field>
              <Field label="Comments (optional)" htmlFor="mo-notes"><Input id="mo-notes" name="notes" /></Field>
              <div className="sm:col-span-2"><SubmitButton size="sm">Add motion</SubmitButton></div>
            </ActionForm>
          </Section>

          <Section title="Action Items">
            {m.meeting.tasks.length > 0 && (
              <ul className="mb-4 divide-y rounded-lg border text-sm">
                {m.meeting.tasks.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <Link href={`${base}/tasks/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                    <span className="text-slate-600">{t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : "Unassigned"}{t.dueDate ? ` · Due ${formatDate(t.dueDate, "short")}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={saveTask} resetOnSuccess className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
              <ScopeInput scope={scope} />
              <input type="hidden" name="stay" value="1" />
              <input type="hidden" name="meetingId" value={m.meetingId} />
              <input type="hidden" name="committeeId" value={c} />
              <p className="font-semibold text-navy-900 sm:col-span-2">Add an action item (creates a task)</p>
              <Field label="Task" htmlFor="ai-title" className="sm:col-span-2"><Input id="ai-title" name="title" required /></Field>
              <Field label="Assigned to" htmlFor="ai-assignee">
                <Select id="ai-assignee" name="assignedMemberId" defaultValue=""><option value="">Unassigned</option>{roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
              </Field>
              <Field label="Due date" htmlFor="ai-due"><Input id="ai-due" name="dueDate" type="date" /></Field>
              <Field label="Priority" htmlFor="ai-priority"><Select id="ai-priority" name="priority" defaultValue="NORMAL"><Options labels={TASK_PRIORITY_LABELS} /></Select></Field>
              <div className="flex items-end"><SubmitButton size="sm">Add action item</SubmitButton></div>
            </ActionForm>
            {carried.length > 0 && (
              <div className="mt-4">
                <p className="mb-1 text-sm font-semibold text-slate-700">Open items carried forward ({carried.length})</p>
                <ul className="text-sm text-slate-600">
                  {carried.map((t, i) => <li key={i}>• {t.title} — {t.assignee ?? "Unassigned"}</li>)}
                </ul>
              </div>
            )}
          </Section>

          <details className="rounded-xl border bg-white p-4 shadow-sm">
            <summary className="cursor-pointer font-semibold text-navy-900">Preview formatted minutes</summary>
            <div className="mt-4"><MinutesDocument r={record} carried={carried} timeZone={org.timezone} /></div>
          </details>
        </>
      ) : (
        <MinutesDocument r={record} carried={carried} timeZone={org.timezone} />
      )}

      {actor.kind === "admin" && revisions.length > 0 && (
        <Section title="Revision History">
          <ul className="divide-y rounded-lg border text-sm">
            {revisions.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium"><History className="mr-1 inline size-4" />Revision {r.revisionNumber} — {r.changeReason}</p>
                  <p className="text-slate-500">{r.changedByName} · {formatDateTime(r.createdAt, org.timezone)}</p>
                </div>
                <Link href={`/admin/minutes/${m.id}/revisions/${r.revisionNumber}`} className={buttonVariants({ variant: "outline", size: "sm" })}>View</Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function WorkflowPanel({ actor, scope, minutesId, status, committeeId, preparedBy, submittedAt, timeZone }: { actor: Actor; scope: "portal" | "admin"; minutesId: string; status: string; committeeId: string; preparedBy: string; submittedAt: Date | null; timeZone: string }) {
  const canSubmit = (status === "DRAFT" || status === "CHANGES_REQUESTED") && can.editDraftMinutes(actor, committeeId);
  const canReview = can.reviewMinutes(actor, committeeId);
  const canPublish = can.publishMinutes(actor, committeeId);
  const hidden = (
    <>
      <ScopeInput scope={scope} />
      <input type="hidden" name="minutesId" value={minutesId} />
    </>
  );
  return (
    <section className="rounded-xl border border-navy-100 bg-navy-50/60 p-4">
      <p className="text-sm font-semibold text-navy-900">Review &amp; approval</p>
      <p className="mb-3 text-sm text-slate-600">
        Prepared by {preparedBy}
        {submittedAt ? ` · Submitted ${formatDateTime(submittedAt, timeZone)}` : ""}. Draft minutes are visible only to committee leadership and administrators.
      </p>
      {status === "SUBMITTED" && !canReview && (
        <p className="mb-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-blue-800 ring-1 ring-blue-100">Submitted — waiting for the chair to review and publish.</p>
      )}
      {status === "APPROVED" && (
        <p className="mb-3 rounded-lg bg-white px-3 py-2 text-sm font-medium text-navy-800 ring-1 ring-navy-100">Approved — ready to publish.</p>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {canSubmit && !canReview && (
            <ActionForm action={submitMinutes} confirm="Submit these minutes to the chair for review?">{hidden}<SubmitButton><Send /> Submit for chair review</SubmitButton></ActionForm>
          )}
          {canReview && status !== "APPROVED" && (
            <ActionForm action={approveMinutes}>{hidden}<SubmitButton variant="secondary"><CheckCircle2 /> Approve</SubmitButton></ActionForm>
          )}
          {canPublish && (canReview || status === "SUBMITTED" || status === "APPROVED") && (
            <ActionForm action={publishMinutes} confirm="Publish these minutes? All committee members will be able to view and download them.">
              {hidden}<SubmitButton variant="success"><CheckCircle2 /> {status === "APPROVED" ? "Publish" : "Approve & Publish"}</SubmitButton>
            </ActionForm>
          )}
        </div>
        {canReview && (status === "SUBMITTED" || status === "APPROVED") && (
          <details>
            <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-amber-800"><Undo2 className="size-4" /> Return for corrections</summary>
            <ActionForm action={returnMinutes} className="mt-2 flex flex-col gap-2">
              {hidden}
              <Textarea name="comment" rows={3} required placeholder="What needs to be corrected?" aria-label="Correction notes" />
              <SubmitButton variant="outline" size="sm">Return to secretary</SubmitButton>
            </ActionForm>
          </details>
        )}
      </div>
    </section>
  );
}
