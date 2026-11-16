import Link from "next/link";
import { Download, Eye, FileImage, FileSpreadsheet, FileText, Folder, Search, Trash2, Upload } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader, ScopeInput, Section } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { DOCUMENT_CATEGORY_LABELS, formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { removeDocument, restoreDocument, updateDocument } from "@/server/document-actions";
import { loadDocument, uploaderName } from "@/server/loaders";
import { UploadForm } from "./meeting-parts";
import { cn } from "@/lib/utils";

type SP = { folder?: string; q?: string; committee?: string; removed?: string };

export function FileIcon({ mime, className = "size-6" }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileImage className={cn(className, "text-emerald-600")} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className={cn(className, "text-green-700")} />;
  return <FileText className={cn(className, mime === "application/pdf" ? "text-red-600" : "text-navy-600")} />;
}

export async function DocumentsListView({ actor, sp }: { actor: Actor; sp: SP }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const org = await getOrganization();
  const folder = sp.folder && sp.folder in DOCUMENT_CATEGORY_LABELS ? sp.folder : undefined;
  const committeeId = actor.kind === "member" ? actor.committeeId : sp.committee || undefined;
  const showRemoved = actor.kind === "admin" && sp.removed === "1";
  const leadership = actor.kind === "admin" || can.manageDocuments(actor, actor.committeeId);

  const where: Prisma.DocumentWhereInput = {
    committee: { organizationId: org.id },
    committeeId,
    removedAt: showRemoved ? { not: null } : null,
    // Task attachments are private to the assignee + leadership.
    ...(actor.kind === "member" && !leadership ? { OR: [{ taskId: null }, { task: { assignedMemberId: actor.memberId } }] } : {}),
  };
  const counts = await db.document.groupBy({ by: ["category"], where, _count: true });
  const countOf = (k: string) => counts.find((c) => c.category === k)?._count ?? 0;
  const docs = await db.document.findMany({
    where: {
      ...where,
      ...(folder ? { category: folder as never } : {}),
      ...(sp.q ? { AND: [{ OR: [{ title: { contains: sp.q, mode: "insensitive" } }, { originalFilename: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }] }] } : {}),
    },
    include: { committee: { select: { name: true } }, uploadedByMember: { select: { firstName: true, lastName: true } }, uploadedByAdmin: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const committees = actor.kind === "admin" ? await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" } }) : [];
  const meetings = actor.kind === "member" && leadership
    ? await db.meeting.findMany({ where: { committeeId: actor.committeeId }, orderBy: { meetingDate: "desc" }, take: 30, select: { id: true, title: true, meetingDate: true } })
    : undefined;
  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${base}/documents?${p.toString()}`;
  };
  const total = counts.reduce((a, c) => a + c._count, 0);

  return (
    <>
      <PageHeader title="Documents" description={actor.kind === "admin" ? "Document libraries for all committees" : `${actor.committeeName} document library`} />
      {leadership && !showRemoved && (
        <details className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-navy-900"><Upload className="size-5" /> Upload a document</summary>
          <div className="mt-4">
            <UploadForm scope={scope} committees={actor.kind === "admin" ? committees : undefined} meetings={meetings} defaultCategory={folder} />
          </div>
        </details>
      )}
      <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible no-print" aria-label="Folders">
          <FolderLink href={qs({ folder: undefined })} active={!folder} label="All documents" count={total} />
          {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([k, v]) => (
            <FolderLink key={k} href={qs({ folder: k })} active={folder === k} label={v} count={countOf(k)} />
          ))}
        </nav>
        <div className="min-w-0">
          <form action={`${base}/documents`} className="mb-3 flex flex-wrap gap-2">
            {folder && <input type="hidden" name="folder" value={folder} />}
            {showRemoved && <input type="hidden" name="removed" value="1" />}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={sp.q} placeholder="Search documents" className="pl-9" aria-label="Search documents" />
            </div>
            {actor.kind === "admin" && (
              <Select name="committee" defaultValue={sp.committee ?? ""} className="w-auto">
                <option value="">All committees</option>
                {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
            <button className={buttonVariants({ variant: "outline" })}>Search</button>
          </form>
          {actor.kind === "admin" && (
            <p className="mb-3 text-sm"><Link className="text-navy-700 underline" href={showRemoved ? `${base}/documents` : `${base}/documents?removed=1`}>{showRemoved ? "← Back to active documents" : "View removed documents"}</Link></p>
          )}
          {docs.length === 0 ? (
            <EmptyState>{sp.q ? "No documents match your search." : "No documents in this folder yet."}</EmptyState>
          ) : (
            <ul className="divide-y rounded-xl border border-slate-200 bg-white shadow-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 p-3 sm:p-4">
                  <FileIcon mime={d.mimeType} />
                  <Link href={`${base}/documents/${d.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900 hover:underline">{d.title}</p>
                    <p className="truncate text-xs text-slate-500">
                      {actor.kind === "admin" ? `${d.committee.name} · ` : ""}{DOCUMENT_CATEGORY_LABELS[d.category]} · {formatDate(d.createdAt, "short")} · {formatBytes(d.fileSize)} · {uploaderName(d)}
                    </p>
                  </Link>
                  {showRemoved ? (
                    <ActionForm action={restoreDocument}>
                      <input type="hidden" name="documentId" value={d.id} />
                      <SubmitButton size="sm" variant="outline">Restore</SubmitButton>
                    </ActionForm>
                  ) : (
                    <>
                      <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener" className="hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:block" aria-label={`View ${d.title}`}><Eye className="size-5" /></a>
                      <a href={`/api/documents/${d.id}/download`} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Download ${d.title}`}><Download className="size-5" /></a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function FolderLink({ href, active, label, count }: { href: string; active: boolean; label: string; count: number }) {
  return (
    <Link href={href} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-navy-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 lg:bg-transparent lg:ring-0")}>
      <Folder className="size-4" />
      <span className="flex-1 whitespace-nowrap">{label}</span>
      <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-slate-100")}>{count}</span>
    </Link>
  );
}

export async function DocumentDetailView({ actor, id }: { actor: Actor; id: string }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const org = await getOrganization();
  const d = await loadDocument(actor, id);
  const manage = !d.removedAt && can.manageDocuments(actor, d.committeeId);
  const meetings = manage
    ? await db.meeting.findMany({ where: { committeeId: d.committeeId }, orderBy: { meetingDate: "desc" }, take: 50, select: { id: true, title: true, meetingDate: true } })
    : [];
  const viewable = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "text/plain"].includes(d.mimeType);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `${base}/documents`, label: "Documents" }}
        title={d.title}
        description={d.removedAt ? <span className="font-semibold text-red-700">Removed {formatDate(d.removedAt, "short")}</span> : DOCUMENT_CATEGORY_LABELS[d.category]}
      />
      <Section title="File">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <FileIcon mime={d.mimeType} className="size-12" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="break-all font-medium">{d.originalFilename}</p>
            <p className="text-slate-500">{formatBytes(d.fileSize)} · Uploaded {formatDateTime(d.createdAt, org.timezone)} by {uploaderName(d)}</p>
            {actor.kind === "admin" && <p className="text-slate-500">Committee: {d.committee.name}</p>}
            {d.meeting && <p className="text-slate-500">Meeting: <Link className="text-navy-700 hover:underline" href={`${base}/meetings/${d.meeting.id}`}>{formatDate(d.meeting.meetingDate, "short")} — {d.meeting.title}</Link></p>}
            {d.task && <p className="text-slate-500">Task: <Link className="text-navy-700 hover:underline" href={`${base}/tasks/${d.task.id}`}>{d.task.title}</Link></p>}
          </div>
          <div className="flex flex-col gap-2 sm:w-44">
            {viewable && <a href={`/api/documents/${d.id}/download?inline=1`} target="_blank" rel="noopener" className={buttonVariants({ size: "lg" })}><Eye /> View</a>}
            <a href={`/api/documents/${d.id}/download`} className={buttonVariants({ variant: viewable ? "outline" : "default", size: "lg" })}><Download /> Download</a>
          </div>
        </div>
        {d.description && <p className="prose-minutes mt-4">{d.description}</p>}
      </Section>
      {manage && (
        <Section title="Organize">
          <ActionForm action={updateDocument} className="grid gap-4 sm:grid-cols-2">
            <ScopeInput scope={scope} />
            <input type="hidden" name="documentId" value={d.id} />
            <Field label="Title" htmlFor="title"><Input id="title" name="title" defaultValue={d.title} required /></Field>
            <Field label="Folder" htmlFor="category" hint="Move to “Archived Documents” to archive."><Select id="category" name="category" defaultValue={d.category}><Options labels={DOCUMENT_CATEGORY_LABELS} /></Select></Field>
            <Field label="Related meeting" htmlFor="meetingId" className="sm:col-span-2">
              <Select id="meetingId" name="meetingId" defaultValue={d.meetingId ?? ""}>
                <option value="">None</option>
                {meetings.map((m) => <option key={m.id} value={m.id}>{formatDate(m.meetingDate, "short")} — {m.title}</option>)}
              </Select>
            </Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" rows={3} defaultValue={d.description ?? ""} /></Field>
            <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
          <ActionForm action={removeDocument} confirm="Remove this document from the library?" className="mt-6 border-t pt-4">
            <ScopeInput scope={scope} />
            <input type="hidden" name="documentId" value={d.id} />
            <SubmitButton variant="outline" className="text-red-700"><Trash2 /> Remove document</SubmitButton>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
