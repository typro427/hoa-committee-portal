import Link from "next/link";
import { ArrowDown, ArrowUp, Download, Eye, FileText, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, ScopeInput } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { AGENDA_SECTION_LABELS, ATTENDANCE_LABELS, formatBytes, formatDate } from "@/lib/format";
import { ACCEPT_ATTR } from "@/lib/storage";
import { sortAgenda } from "@/lib/agenda";
import {
  addAgendaItem, addGuest, deleteAgendaItem, insertStandardAgenda, moveAgendaItem, removeAttendee, saveAttendance, updateAgendaItem,
} from "@/server/meeting-actions";
import { uploadDocument } from "@/server/document-actions";

type Scope = "portal" | "admin";
type Doc = { id: string; title: string; originalFilename: string; fileSize: number; createdAt: Date; mimeType: string };
type AgendaItem = { id: string; section: string; title: string; description: string | null; displayOrder: number; documents: Doc[] };

// ---------------- Agenda ----------------

export function AgendaView({ items }: { items: AgendaItem[] }) {
  if (items.length === 0) return <EmptyState>No agenda has been posted yet.</EmptyState>;
  const sorted = sortAgenda(items);
  const sections = [...new Set(sorted.map((i) => i.section))];
  return (
    <ol className="flex flex-col gap-4">
      {sections.map((s, si) => (
        <li key={s}>
          <p className="text-sm font-semibold uppercase tracking-wide text-navy-700">{si + 1}. {AGENDA_SECTION_LABELS[s as keyof typeof AGENDA_SECTION_LABELS]}</p>
          <ul className="mt-1 flex flex-col gap-2 border-l-2 border-navy-100 pl-4">
            {sorted.filter((i) => i.section === s).map((i) => (
              <li key={i.id}>
                {i.title !== AGENDA_SECTION_LABELS[s as keyof typeof AGENDA_SECTION_LABELS] && <p className="font-medium text-slate-900">{i.title}</p>}
                {i.description && <p className="prose-minutes text-sm text-slate-600">{i.description}</p>}
                <DocLinks docs={i.documents} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function AgendaEditor({ scope, meetingId, items }: { scope: Scope; meetingId: string; items: AgendaItem[] }) {
  const sorted = sortAgenda(items);
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={insertStandardAgenda} className="no-print">
        <ScopeInput scope={scope} />
        <input type="hidden" name="meetingId" value={meetingId} />
        <SubmitButton variant="secondary" size="sm" pendingText="Adding…">Insert standard agenda sections</SubmitButton>
      </ActionForm>
      {sorted.length === 0 ? (
        <EmptyState>No agenda items yet. Insert the standard sections or add items below.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((i, idx) => (
            <li key={i.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-600">{AGENDA_SECTION_LABELS[i.section as keyof typeof AGENDA_SECTION_LABELS]}</p>
                  <p className="font-medium text-slate-900 break-words">{i.title}</p>
                  {i.description && <p className="prose-minutes text-sm text-slate-600">{i.description}</p>}
                  <DocLinks docs={i.documents} />
                </div>
                <div className="flex shrink-0 gap-1">
                  <MoveButton scope={scope} itemId={i.id} direction="up" disabled={idx === 0} />
                  <MoveButton scope={scope} itemId={i.id} direction="down" disabled={idx === sorted.length - 1} />
                  <ActionForm action={deleteAgendaItem} confirm="Remove this agenda item?" showMessages={false}>
                    <ScopeInput scope={scope} />
                    <input type="hidden" name="itemId" value={i.id} />
                    <Button variant="ghost" size="icon" aria-label="Remove item"><Trash2 className="text-red-600" /></Button>
                  </ActionForm>
                </div>
              </div>
              <details className="mt-2">
                <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-navy-700"><Pencil className="size-3.5" /> Edit or attach a document</summary>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <ActionForm action={updateAgendaItem} className="flex flex-col gap-3">
                    <ScopeInput scope={scope} />
                    <input type="hidden" name="itemId" value={i.id} />
                    <Select name="section" defaultValue={i.section} aria-label="Section"><Options labels={AGENDA_SECTION_LABELS} /></Select>
                    <Input name="title" defaultValue={i.title} required aria-label="Title" />
                    <Textarea name="description" defaultValue={i.description ?? ""} rows={2} placeholder="Description (optional)" aria-label="Description" />
                    <SubmitButton size="sm">Save item</SubmitButton>
                  </ActionForm>
                  <UploadForm scope={scope} hidden={{ agendaItemId: i.id }} compact />
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={addAgendaItem} resetOnSuccess className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 no-print">
        <ScopeInput scope={scope} />
        <input type="hidden" name="meetingId" value={meetingId} />
        <p className="font-semibold text-navy-900 sm:col-span-2">Add agenda item</p>
        <Field label="Section" htmlFor="new-section"><Select id="new-section" name="section" defaultValue="NEW_BUSINESS"><Options labels={AGENDA_SECTION_LABELS} /></Select></Field>
        <Field label="Title" htmlFor="new-title"><Input id="new-title" name="title" required maxLength={300} /></Field>
        <Field label="Description (optional)" htmlFor="new-desc" className="sm:col-span-2"><Textarea id="new-desc" name="description" rows={2} /></Field>
        <div className="sm:col-span-2"><SubmitButton size="sm">Add item</SubmitButton></div>
      </ActionForm>
    </div>
  );
}

function MoveButton({ scope, itemId, direction, disabled }: { scope: Scope; itemId: string; direction: "up" | "down"; disabled: boolean }) {
  return (
    <ActionForm action={moveAgendaItem} showMessages={false}>
      <ScopeInput scope={scope} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="direction" value={direction} />
      <Button variant="ghost" size="icon" disabled={disabled} aria-label={`Move ${direction}`}>{direction === "up" ? <ArrowUp /> : <ArrowDown />}</Button>
    </ActionForm>
  );
}

// ---------------- Attendance ----------------

type Attendance = { id: string; memberId: string | null; attendeeName: string; attendanceStatus: string; notes: string | null };

export function AttendanceView({ attendance }: { attendance: Attendance[] }) {
  if (attendance.length === 0) return <p className="text-sm text-slate-500">Attendance has not been recorded.</p>;
  const groups = (["PRESENT", "ABSENT", "EXCUSED", "GUEST"] as const).map((s) => ({ s, list: attendance.filter((a) => a.attendanceStatus === s) }));
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {groups.filter((g) => g.list.length).map((g) => (
        <div key={g.s}>
          <dt className="text-sm font-semibold text-slate-700">{g.s === "GUEST" ? "Guests / Additional Attendees" : ATTENDANCE_LABELS[g.s]} ({g.list.length})</dt>
          <dd className="text-sm text-slate-600">{g.list.map((a) => a.attendeeName + (a.notes ? ` (${a.notes})` : "")).join(", ")}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AttendanceEditor({ scope, meetingId, roster, attendance }: { scope: Scope; meetingId: string; roster: { id: string; name: string; role: string }[]; attendance: Attendance[] }) {
  const byMember = new Map(attendance.filter((a) => a.memberId).map((a) => [a.memberId!, a.attendanceStatus]));
  const guests = attendance.filter((a) => a.attendanceStatus === "GUEST" || !a.memberId);
  const formerMembers = attendance.filter((a) => a.memberId && !roster.some((r) => r.id === a.memberId));
  return (
    <div className="flex flex-col gap-4">
      <ActionForm action={saveAttendance}>
        <ScopeInput scope={scope} />
        <input type="hidden" name="meetingId" value={meetingId} />
        <ul className="divide-y rounded-lg border">
          {roster.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="font-medium">{r.name}</span>
              <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${r.name}`}>
                {(["PRESENT", "ABSENT", "EXCUSED"] as const).map((s) => (
                  <label key={s} className="cursor-pointer">
                    <input type="radio" name={`att_${r.id}`} value={s} defaultChecked={byMember.get(r.id) === s} className="peer sr-only" />
                    <span className="inline-block rounded-lg border px-3 py-2 text-sm font-medium text-slate-600 peer-checked:border-navy-700 peer-checked:bg-navy-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-navy-500">
                      {ATTENDANCE_LABELS[s]}
                    </span>
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {formerMembers.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">Also recorded: {formerMembers.map((f) => `${f.attendeeName} (${ATTENDANCE_LABELS[f.attendanceStatus as keyof typeof ATTENDANCE_LABELS]})`).join(", ")}</p>
        )}
        <SubmitButton className="mt-3" size="sm">Save attendance</SubmitButton>
      </ActionForm>
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Guests and additional attendees</p>
        {guests.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {guests.map((g) => (
              <li key={g.id} className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm">
                {g.attendeeName}{g.notes ? ` — ${g.notes}` : ""}
                <ActionForm action={removeAttendee} showMessages={false} confirm={`Remove ${g.attendeeName}?`}>
                  <ScopeInput scope={scope} />
                  <input type="hidden" name="attendanceId" value={g.id} />
                  <button className="rounded-full p-1 hover:bg-slate-200" aria-label={`Remove ${g.attendeeName}`}><X className="size-3.5" /></button>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={addGuest} resetOnSuccess className="flex flex-col gap-2 sm:flex-row">
          <ScopeInput scope={scope} />
          <input type="hidden" name="meetingId" value={meetingId} />
          <Input name="name" placeholder="Guest name" required aria-label="Guest name" />
          <Input name="notes" placeholder="Affiliation (optional)" aria-label="Guest affiliation" />
          <SubmitButton variant="secondary" className="shrink-0"><UserPlus /> Add guest</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}

// ---------------- Documents ----------------

export function DocLinks({ docs }: { docs: Doc[] }) {
  if (!docs.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {docs.map((d) => (
        <li key={d.id}>
          <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-700 hover:underline">
            <FileText className="size-4" /> {d.title}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function DocList({ docs, base }: { docs: Doc[]; base: string }) {
  if (!docs.length) return <p className="text-sm text-slate-500">No documents attached.</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center gap-3 p-3">
          <FileText className="size-5 shrink-0 text-navy-600" />
          <div className="min-w-0 flex-1">
            <Link href={`${base}/documents/${d.id}`} className="block truncate font-medium text-slate-900 hover:underline">{d.title}</Link>
            <p className="text-xs text-slate-500">{formatBytes(d.fileSize)} · {formatDate(d.createdAt, "short")}</p>
          </div>
          <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`View ${d.title}`}><Eye className="size-5" /></a>
          <a href={`/api/documents/${d.id}/download`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Download ${d.title}`}><Download className="size-5" /></a>
        </li>
      ))}
    </ul>
  );
}

export function UploadForm({
  scope, hidden, compact, committees, meetings, folders, defaultFolderId,
}: {
  scope: Scope;
  hidden?: Record<string, string>;
  compact?: boolean;
  committees?: { id: string; name: string }[];
  meetings?: { id: string; title: string; meetingDate: Date }[];
  /** When given, the uploader picks a folder. Otherwise the file is filed automatically. */
  folders?: { id: string; name: string }[];
  defaultFolderId?: string;
}) {
  const sfx = Object.values(hidden ?? {}).join("").slice(0, 36) || "lib"; // unique ids when several forms share a page
  return (
    <ActionForm action={uploadDocument} resetOnSuccess className={compact ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"}>
      <ScopeInput scope={scope} />
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {committees && (
        <Field label="Committee" htmlFor={`up-committee-${sfx}`} className="sm:col-span-2">
          <Select id={`up-committee-${sfx}`} name="committeeId" required defaultValue="">
            <option value="">Choose a committee…</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="File" htmlFor={`file-${sfx}`} hint="PDF, Word, Excel, PowerPoint, text, or images · up to 25 MB" className={compact ? "" : "sm:col-span-2"}>
        <input id={`file-${sfx}`} name="file" type="file" required accept={ACCEPT_ATTR} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold file:text-navy-800" />
      </Field>
      <Field label="Title (optional)" htmlFor={`up-title-${sfx}`}>
        <Input id={`up-title-${sfx}`} name="title" maxLength={200} placeholder="Defaults to the file name" />
      </Field>
      {folders && (
        <Field label="Folder" htmlFor={`up-folder-${sfx}`}>
          <Select id={`up-folder-${sfx}`} name="folderId" defaultValue={defaultFolderId ?? folders.find((f) => /general/i.test(f.name))?.id ?? folders[0]?.id ?? ""}>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value="">Unfiled</option>
          </Select>
        </Field>
      )}
      {meetings && (
        <Field label="Related meeting (optional)" htmlFor={`up-meeting-${sfx}`}>
          <Select id={`up-meeting-${sfx}`} name="meetingId" defaultValue="">
            <option value="">None</option>
            {meetings.map((m) => <option key={m.id} value={m.id}>{formatDate(m.meetingDate, "short")} — {m.title}</option>)}
          </Select>
        </Field>
      )}
      {!compact && (
        <Field label="Description (optional)" htmlFor={`up-desc-${sfx}`} className="sm:col-span-2">
          <Textarea id={`up-desc-${sfx}`} name="description" rows={2} />
        </Field>
      )}
      <div className={compact ? "" : "sm:col-span-2"}>
        <SubmitButton size={compact ? "sm" : "default"} pendingText="Uploading…">Upload</SubmitButton>
      </div>
    </ActionForm>
  );
}
