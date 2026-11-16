import Link from "next/link";
import { CheckCircle2, Download, Eye, FileImage, FileSpreadsheet, FileText, Files, Folder, FolderCog, FolderPlus, FolderX, Pencil, Search, Trash2, Upload } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, PageHeader, ScopeInput, Section } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatBytes, formatDate, formatDateTime } from "@/lib/format";
import { createFolder, removeDocument, removeFolder, renameFolder, restoreDocument, updateDocument } from "@/server/document-actions";
import { committeeFolders } from "@/server/folders";
import { loadDocument, uploaderName } from "@/server/loaders";
import { UploadForm } from "./meeting-parts";
import { cn } from "@/lib/utils";

type SP = { folder?: string; q?: string; committee?: string; removed?: string; removedFolder?: string; moved?: string; movedTo?: string };

export function FileIcon({ mime, className = "size-6" }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <FileImage className={cn(className, "text-emerald-600")} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className={cn(className, "text-green-700")} />;
  return <FileText className={cn(className, mime === "application/pdf" ? "text-red-600" : "text-navy-600")} />;
}

export async function DocumentsListView({ actor, sp }: { actor: Actor; sp: SP }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const org = await getOrganization();
  const committees = actor.kind === "admin" ? await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" } }) : [];
  // Folders belong to a committee, so admins browse folders after choosing one.
  const committeeId = actor.kind === "member" ? actor.committeeId : committees.find((c) => c.id === sp.committee)?.id;
  const showRemoved = actor.kind === "admin" && sp.removed === "1";
  const leadership = actor.kind === "admin" || can.manageDocuments(actor, actor.committeeId);
  const manageFolders = !!committeeId && can.manageFolders(actor, committeeId);
  const folders = committeeId ? await committeeFolders(committeeId) : [];
  const folder = sp.folder === "unfiled" ? "unfiled" : folders.find((f) => f.id === sp.folder)?.id;

  const where: Prisma.DocumentWhereInput = {
    committee: { organizationId: org.id },
    committeeId,
    removedAt: showRemoved ? { not: null } : null,
    // Task attachments are private to the assignee + leadership.
    ...(actor.kind === "member" && !leadership ? { OR: [{ taskId: null }, { task: { assignedMemberId: actor.memberId } }] } : {}),
  };
  const counts = committeeId ? await db.document.groupBy({ by: ["folderId"], where, _count: { _all: true } }) : [];
  const countOf = (id: string | null) => counts.find((c) => c.folderId === id)?._count._all ?? 0;
  const total = counts.reduce((a, c) => a + c._count._all, 0);
  const unfiled = countOf(null);

  const docs = await db.document.findMany({
    where: {
      ...where,
      ...(folder === "unfiled" ? { folderId: null } : folder ? { folderId: folder } : {}),
      ...(sp.q ? { AND: [{ OR: [{ title: { contains: sp.q, mode: "insensitive" } }, { originalFilename: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }] }] } : {}),
    },
    include: {
      committee: { select: { name: true } },
      folder: { select: { name: true } },
      uploadedByMember: { select: { firstName: true, lastName: true } },
      uploadedByAdmin: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  const meetings = committeeId && leadership
    ? await db.meeting.findMany({ where: { committeeId }, orderBy: { meetingDate: "desc" }, take: 30, select: { id: true, title: true, meetingDate: true } })
    : undefined;
  const qs = (o: Partial<SP>) => {
    const keep = { ...sp, removedFolder: undefined, moved: undefined, movedTo: undefined, ...o };
    const p = new URLSearchParams(Object.entries(keep).filter(([, v]) => v) as [string, string][]);
    return `${base}/documents?${p.toString()}`;
  };
  const currentName = folder === "unfiled" ? "Unfiled" : folders.find((f) => f.id === folder)?.name;

  return (
    <>
      <PageHeader title="Documents" description={actor.kind === "admin" ? "Document libraries for all committees" : `${actor.committeeName} document library`} />

      {actor.kind === "admin" && (
        <form action={`${base}/documents`} className="mb-4 flex flex-wrap items-center gap-2">
          {showRemoved && <input type="hidden" name="removed" value="1" />}
          <Select name="committee" defaultValue={committeeId ?? ""} className="w-auto">
            <option value="">All committees</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className={buttonVariants({ variant: "outline" })}>Show</button>
          <Link className="text-sm text-navy-700 underline" href={showRemoved ? `${base}/documents` : `${base}/documents?removed=1`}>
            {showRemoved ? "← Back to active documents" : "View removed documents"}
          </Link>
        </form>
      )}

      {sp.removedFolder && (
        <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>
            Folder “{sp.removedFolder.slice(0, 80)}” removed.
            {Number(sp.moved) > 0 && ` ${Number(sp.moved)} document${Number(sp.moved) === 1 ? " was" : "s were"} moved to “${(sp.movedTo ?? "Unfiled").slice(0, 80)}”.`}
          </span>
        </p>
      )}

      {leadership && !showRemoved && (
        <details className="mb-5 rounded-xl border bg-white p-4 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-navy-900"><Upload className="size-5" /> Upload a document</summary>
          <div className="mt-4">
            {committeeId ? (
              <UploadForm scope={scope} hidden={actor.kind === "admin" ? { committeeId } : undefined} meetings={meetings} folders={folders} defaultFolderId={folder && folder !== "unfiled" ? folder : undefined} />
            ) : (
              <p className="text-sm text-slate-600">Choose a committee above to upload a document to its library.</p>
            )}
          </div>
        </details>
      )}

      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <div className="flex min-w-0 flex-col gap-3 no-print">
          {committeeId ? (
            <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible" aria-label="Folders">
              <FolderLink href={qs({ folder: undefined })} active={!folder} label="All documents" count={total} icon="all" />
              {folders.map((f) => <FolderLink key={f.id} href={qs({ folder: f.id })} active={folder === f.id} label={f.name} count={countOf(f.id)} />)}
              {(unfiled > 0 || folder === "unfiled") && <FolderLink href={qs({ folder: "unfiled" })} active={folder === "unfiled"} label="Unfiled" count={unfiled} icon="unfiled" />}
            </nav>
          ) : (
            <p className="rounded-xl border border-dashed bg-white/60 p-3 text-sm text-slate-500">Choose a committee to browse its folders.</p>
          )}
          {manageFolders && !showRemoved && <FolderManager scope={scope} committeeId={committeeId!} folders={folders} counts={Object.fromEntries(folders.map((f) => [f.id, countOf(f.id)]))} />}
        </div>
        <div className="min-w-0">
          <form action={`${base}/documents`} className="mb-3 flex gap-2">
            {folder && <input type="hidden" name="folder" value={folder} />}
            {actor.kind === "admin" && committeeId && <input type="hidden" name="committee" value={committeeId} />}
            {showRemoved && <input type="hidden" name="removed" value="1" />}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={sp.q} placeholder={currentName ? `Search ${currentName}` : "Search documents"} className="pl-9" aria-label="Search documents" />
            </div>
            <button className={buttonVariants({ variant: "outline" })}>Search</button>
          </form>
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
                      {actor.kind === "admin" && !committeeId ? `${d.committee.name} · ` : ""}{d.folder?.name ?? "Unfiled"} · {formatDate(d.createdAt, "short")} · {formatBytes(d.fileSize)} · {uploaderName(d)}
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

function FolderLink({ href, active, label, count, icon }: { href: string; active: boolean; label: string; count: number; icon?: "all" | "unfiled" }) {
  const Icon = icon === "all" ? Files : icon === "unfiled" ? FolderX : Folder;
  return (
    <Link href={href} className={cn("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", active ? "bg-navy-800 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 lg:bg-transparent lg:ring-0")}>
      <Icon className="size-4 shrink-0" />
      <span className="flex-1 whitespace-nowrap lg:whitespace-normal lg:break-words">{label}</span>
      <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-white/20" : "bg-slate-100")}>{count}</span>
    </Link>
  );
}

/** Add, rename, and remove folders (committee chair or administrator). */
function FolderManager({ scope, committeeId, folders, counts }: { scope: "portal" | "admin"; committeeId: string; folders: { id: string; name: string }[]; counts: Record<string, number> }) {
  return (
    <details className="rounded-xl border bg-white p-3 shadow-sm">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-navy-900"><FolderCog className="size-4" /> Manage folders</summary>
      <div className="mt-3 flex flex-col gap-4">
        <ActionForm action={createFolder} resetOnSuccess className="flex flex-col gap-2">
          <ScopeInput scope={scope} />
          <input type="hidden" name="committeeId" value={committeeId} />
          <label htmlFor="new-folder" className="text-xs font-semibold uppercase tracking-wide text-slate-500">New folder</label>
          <div className="flex gap-2">
            <Input id="new-folder" name="name" required maxLength={80} placeholder="e.g. Gate Access" className="h-10" />
            <SubmitButton size="sm" className="h-10 shrink-0"><FolderPlus /> Add</SubmitButton>
          </div>
        </ActionForm>
        {folders.length > 0 && (
          <ul className="flex flex-col gap-2 border-t pt-3">
            {folders.map((f) => (
              <li key={f.id}>
                <details className="group rounded-lg border">
                  <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                    <Folder className="size-4 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 break-words font-medium">{f.name}</span>
                    <Pencil className="size-3.5 shrink-0 text-navy-600" />
                  </summary>
                  <div className="flex flex-col gap-3 border-t p-3">
                    <ActionForm action={renameFolder} className="flex flex-col gap-2">
                      <ScopeInput scope={scope} />
                      <input type="hidden" name="folderId" value={f.id} />
                      <label className="text-xs font-semibold text-slate-500" htmlFor={`rn-${f.id}`}>Rename</label>
                      <div className="flex gap-2">
                        <Input id={`rn-${f.id}`} name="name" defaultValue={f.name} required maxLength={80} className="h-10" />
                        <SubmitButton size="sm" variant="secondary" className="h-10 shrink-0">Save</SubmitButton>
                      </div>
                    </ActionForm>
                    <ActionForm
                      action={removeFolder}
                      confirm={counts[f.id] ? `Remove “${f.name}”? Its ${counts[f.id]} document${counts[f.id] === 1 ? "" : "s"} will be moved, not deleted.` : `Remove the empty folder “${f.name}”?`}
                      className="flex flex-col gap-2"
                    >
                      <ScopeInput scope={scope} />
                      <input type="hidden" name="folderId" value={f.id} />
                      {counts[f.id] > 0 && (
                        <>
                          <label className="text-xs font-semibold text-slate-500" htmlFor={`mv-${f.id}`}>Move its {counts[f.id]} document{counts[f.id] === 1 ? "" : "s"} to</label>
                          <Select id={`mv-${f.id}`} name="moveTo" defaultValue="" className="h-10">
                            <option value="">Unfiled</option>
                            {folders.filter((o) => o.id !== f.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </Select>
                        </>
                      )}
                      <SubmitButton size="sm" variant="outline" className="text-red-700"><Trash2 /> Remove folder</SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">Removing a folder never deletes documents. Meeting files are filed automatically into a folder with “Meeting” in its name.</p>
      </div>
    </details>
  );
}

export async function DocumentDetailView({ actor, id }: { actor: Actor; id: string }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const org = await getOrganization();
  const d = await loadDocument(actor, id);
  const manage = !d.removedAt && can.manageDocuments(actor, d.committeeId);
  const folders = manage ? await committeeFolders(d.committeeId) : [];
  const meetings = manage
    ? await db.meeting.findMany({ where: { committeeId: d.committeeId }, orderBy: { meetingDate: "desc" }, take: 50, select: { id: true, title: true, meetingDate: true } })
    : [];
  const viewable = ["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp", "text/plain"].includes(d.mimeType);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `${base}/documents`, label: "Documents" }}
        title={d.title}
        description={d.removedAt ? <span className="font-semibold text-red-700">Removed {formatDate(d.removedAt, "short")}</span> : d.folder?.name ?? "Unfiled"}
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
            <Field label="Folder" htmlFor="folderId">
              <Select id="folderId" name="folderId" defaultValue={d.folderId ?? ""}>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="">Unfiled</option>
              </Select>
            </Field>
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
