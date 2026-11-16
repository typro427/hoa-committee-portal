import Link from "next/link";
import { AlertCircle, CalendarClock, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader, PriorityBadge, ScopeInput, Section, Tabs, TaskStatusBadge } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { dateToISO, formatDate, formatDateTime, isoToDate, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, todayISO } from "@/lib/format";
import { saveTask, updateTaskStatus } from "@/server/task-actions";
import { committeeRoster, loadTask } from "@/server/loaders";
import { DocList, UploadForm } from "./meeting-parts";
import { cn } from "@/lib/utils";

type SP = { tab?: string; committee?: string; assignee?: string };
const OPEN = { notIn: ["COMPLETED", "CANCELLED"] } as Prisma.EnumTaskStatusFilter;

export async function TasksListView({ actor, sp }: { actor: Actor; sp: SP }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const org = await getOrganization();
  const today = isoToDate(todayISO(org.timezone));
  const in14 = new Date(today.getTime() + 14 * 86400_000);
  const leadership = actor.kind === "admin" || can.viewAllCommitteeTasks(actor, actor.committeeId);

  // Members: "mine" scope by default. Leadership can view all committee tasks.
  const scopeAll = actor.kind === "admin" || (leadership && sp.assignee === "all");
  const scopeWhere: Prisma.TaskWhereInput = {
    committee: { organizationId: org.id },
    ...(actor.kind === "member" ? { committeeId: actor.committeeId } : sp.committee ? { committeeId: sp.committee } : {}),
    ...(scopeAll ? {} : { assignedMemberId: actor.kind === "member" ? actor.memberId : undefined }),
  };
  const tabs = {
    open: { ...scopeWhere, status: OPEN },
    upcoming: { ...scopeWhere, status: OPEN, dueDate: { gte: today, lte: in14 } },
    overdue: { ...scopeWhere, status: OPEN, dueDate: { lt: today } },
    completed: { ...scopeWhere, status: { in: ["COMPLETED", "CANCELLED"] } },
  } satisfies Record<string, Prisma.TaskWhereInput>;
  const tab = (sp.tab && sp.tab in tabs ? sp.tab : "open") as keyof typeof tabs;
  const counts = await Promise.all(Object.values(tabs).map((w) => db.task.count({ where: w })));
  const tasks = await db.task.findMany({
    where: tabs[tab],
    include: { assignedMember: { select: { firstName: true, lastName: true } }, committee: { select: { name: true } }, meeting: { select: { title: true } } },
    orderBy: tab === "completed" ? [{ completedAt: "desc" }, { updatedAt: "desc" }] : [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    take: 300,
  });
  const committees = actor.kind === "admin" ? await db.committee.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } }) : [];
  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${base}/tasks?${p.toString()}`;
  };
  const labels = { open: scopeAll ? "Open Tasks" : "My Tasks", upcoming: "Upcoming Due Dates", overdue: "Overdue", completed: "Completed" };

  return (
    <>
      <PageHeader
        title={actor.kind === "admin" ? "Tasks" : scopeAll ? "Committee Tasks" : "My Tasks"}
        description={actor.kind === "admin" ? "All tasks across committees" : scopeAll ? `All tasks for ${actor.committeeName}` : "Tasks assigned to you"}
        actions={(actor.kind === "admin" || can.manageTasks(actor, actor.committeeId)) && (
          <Link href={`${base}/tasks/new`} className={buttonVariants()}><Plus /> New Task</Link>
        )}
      />
      {actor.kind === "member" && leadership && (
        <div className="mb-3 flex rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200 w-fit">
          <Link href={qs({ assignee: undefined })} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", !scopeAll ? "bg-navy-800 text-white" : "text-slate-600")}>Assigned to me</Link>
          <Link href={qs({ assignee: "all" })} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", scopeAll ? "bg-navy-800 text-white" : "text-slate-600")}>All committee tasks</Link>
        </div>
      )}
      {actor.kind === "admin" && (
        <form action={`${base}/tasks`} className="mb-3 flex gap-2">
          {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
          <Select name="committee" defaultValue={sp.committee ?? ""} className="h-10 w-auto">
            <option value="">All committees</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className={buttonVariants({ variant: "outline", size: "sm" })}>Filter</button>
        </form>
      )}
      <Tabs current={tab} tabs={(Object.keys(tabs) as (keyof typeof tabs)[]).map((k, i) => ({ key: k, label: labels[k], href: qs({ tab: k === "open" ? undefined : k }), count: counts[i] }))} />
      {tasks.length === 0 ? (
        <EmptyState>{tab === "overdue" ? "Nothing overdue. Nice work!" : "No tasks here."}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {tasks.map((t) => {
            const overdue = t.dueDate && t.dueDate < today && t.status !== "COMPLETED" && t.status !== "CANCELLED";
            return (
              <li key={t.id}>
                <Link href={`${base}/tasks/${t.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-navy-300">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-navy-900">{t.title}</p>
                    <div className="flex gap-1"><PriorityBadge priority={t.priority} /><TaskStatusBadge status={t.status} /></div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                    {actor.kind === "admin" && <span className="font-medium text-navy-600">{t.committee.name}</span>}
                    {scopeAll && <span>{t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : "Unassigned"}</span>}
                    {t.dueDate && (
                      <span className={cn("inline-flex items-center gap-1", overdue && "font-semibold text-red-700")}>
                        {overdue ? <AlertCircle className="size-4" /> : <CalendarClock className="size-4" />}
                        {overdue ? "Overdue · " : "Due "}{formatDate(t.dueDate, "short")}
                      </span>
                    )}
                    {t.meeting && <span className="text-slate-500">From: {t.meeting.title}</span>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

type TaskLike = { id: string; title: string; description: string | null; assignedMemberId: string | null; meetingId: string | null; priority: string; status: string; dueDate: Date | null; committeeId: string };

export async function TaskForm({ actor, task, committees, defaultCommitteeId }: { actor: Actor; task?: TaskLike; committees?: { id: string; name: string }[]; defaultCommitteeId?: string }) {
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const committeeId = task?.committeeId ?? (actor.kind === "member" ? actor.committeeId : defaultCommitteeId);
  const roster = committeeId ? await committeeRoster(committeeId) : [];
  const meetings = committeeId
    ? await db.meeting.findMany({ where: { committeeId }, orderBy: { meetingDate: "desc" }, take: 30, select: { id: true, title: true, meetingDate: true } })
    : [];
  return (
    <ActionForm action={saveTask} className="grid gap-4 sm:grid-cols-2">
      <ScopeInput scope={scope} />
      {task && <input type="hidden" name="id" value={task.id} />}
      {!task && actor.kind === "admin" && committeeId && (
        <div className="sm:col-span-2 text-sm text-slate-600">
          <input type="hidden" name="committeeId" value={committeeId} />
          Committee: <span className="font-semibold text-navy-900">{committees?.find((c) => c.id === committeeId)?.name}</span>
        </div>
      )}
      <Field label="Task title" htmlFor="title" className="sm:col-span-2"><Input id="title" name="title" required maxLength={300} defaultValue={task?.title} /></Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" rows={4} defaultValue={task?.description ?? ""} /></Field>
      <Field label="Assigned member" htmlFor="assignedMemberId">
        <Select id="assignedMemberId" name="assignedMemberId" defaultValue={task?.assignedMemberId ?? ""}>
          <option value="">Unassigned</option>
          {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </Select>
      </Field>
      <Field label="Due date" htmlFor="dueDate"><Input id="dueDate" name="dueDate" type="date" defaultValue={dateToISO(task?.dueDate)} /></Field>
      <Field label="Priority" htmlFor="priority"><Select id="priority" name="priority" defaultValue={task?.priority ?? "NORMAL"}><Options labels={TASK_PRIORITY_LABELS} /></Select></Field>
      <Field label="Status" htmlFor="status"><Select id="status" name="status" defaultValue={task?.status ?? "NOT_STARTED"}><Options labels={TASK_STATUS_LABELS} /></Select></Field>
      <Field label="Associated meeting (optional)" htmlFor="meetingId" className="sm:col-span-2">
        <Select id="meetingId" name="meetingId" defaultValue={task?.meetingId ?? ""}>
          <option value="">None</option>
          {meetings.map((m) => <option key={m.id} value={m.id}>{formatDate(m.meetingDate, "short")} — {m.title}</option>)}
        </Select>
      </Field>
      <div className="sm:col-span-2"><SubmitButton>{task ? "Save Task" : "Create Task"}</SubmitButton></div>
    </ActionForm>
  );
}

export async function TaskDetailView({ actor, id }: { actor: Actor; id: string }) {
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const org = await getOrganization();
  const t = await loadTask(actor, id);
  const isAssignee = actor.kind === "member" && t.assignedMemberId === actor.memberId;
  const manage = can.manageTasks(actor, t.committeeId);
  const canUpdate = isAssignee || manage;
  const createdBy = t.createdByMember ? `${t.createdByMember.firstName} ${t.createdByMember.lastName}` : t.createdByAdmin ? `${t.createdByAdmin.name} (Admin)` : "—";

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `${base}/tasks`, label: "Tasks" }}
        title={t.title}
        description={<div className="flex flex-wrap gap-2"><PriorityBadge priority={t.priority} /><TaskStatusBadge status={t.status} />{actor.kind === "admin" && <span>{t.committee.name}</span>}</div>}
      />
      <Section title="Details">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Assigned to" value={t.assignedMember ? `${t.assignedMember.firstName} ${t.assignedMember.lastName}` : "Unassigned"} />
          <Item label="Due date" value={t.dueDate ? formatDate(t.dueDate) : "No due date"} />
          <Item label="Created by" value={`${createdBy} · ${formatDate(t.createdAt, "short")}`} />
          <Item label="Meeting" value={t.meeting ? <Link className="font-medium text-navy-700 hover:underline" href={`${base}/meetings/${t.meeting.id}`}>{formatDate(t.meeting.meetingDate, "short")} — {t.meeting.title}</Link> : "Not linked to a meeting"} />
          {t.completedAt && <Item label="Completed" value={`${formatDateTime(t.completedAt, org.timezone)} by ${t.completedByName ?? "—"}`} />}
        </dl>
        {t.description && <p className="prose-minutes mt-4">{t.description}</p>}
        {t.completionNotes && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-700">Completion notes</p>
            <p className="prose-minutes text-sm">{t.completionNotes}</p>
          </div>
        )}
      </Section>

      {canUpdate && (
        <Section title="Update Status">
          <ActionForm action={updateTaskStatus} className="flex flex-col gap-4">
            <ScopeInput scope={scope} />
            <input type="hidden" name="taskId" value={t.id} />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Task status">
              {(Object.entries(TASK_STATUS_LABELS) as [string, string][]).map(([k, v]) => (
                <label key={k} className="cursor-pointer">
                  <input type="radio" name="status" value={k} defaultChecked={t.status === k} className="peer sr-only" />
                  <span className="flex h-14 items-center justify-center rounded-xl border-2 border-slate-200 px-3 text-center text-base font-semibold text-slate-700 peer-checked:border-navy-800 peer-checked:bg-navy-800 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-navy-500">
                    {v}
                  </span>
                </label>
              ))}
            </div>
            <Field label="Completion notes / progress update" htmlFor="completionNotes">
              <Textarea id="completionNotes" name="completionNotes" rows={3} defaultValue={t.completionNotes ?? ""} />
            </Field>
            <SubmitButton size="lg">Save Update</SubmitButton>
          </ActionForm>
        </Section>
      )}

      <Section title="Supporting Documents">
        <DocList docs={t.documents} base={base} />
        {canUpdate && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-navy-700">Attach a file</summary>
            <div className="mt-3"><UploadForm scope={scope} hidden={{ taskId: t.id }} compact /></div>
          </details>
        )}
      </Section>

      {manage && (
        <Section title="Edit Task">
          <TaskForm actor={actor} task={t} />
        </Section>
      )}
    </div>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </div>
  );
}
