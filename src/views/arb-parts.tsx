import { Check, CircleAlert, Download, Eye, FileText, Lock, MessageSquare, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ARB_DOC_TYPES, ARB_PROGRESS_STEPS, ARB_STATUS_LABELS, ARB_STATUS_TONE, progressIndex, type ArbDocTypeKey, type ArbStatusKey } from "@/lib/arb";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ArbStatusBadge({ status }: { status: ArbStatusKey }) {
  return <Badge tone={ARB_STATUS_TONE[status]}>{ARB_STATUS_LABELS[status]}</Badge>;
}

/** Horizontal stage tracker (vertical on phones). */
export function ArbProgress({ status }: { status: ArbStatusKey }) {
  const current = progressIndex(status);
  const denied = status === "DENIED";
  return (
    <ol className="flex flex-col gap-0 sm:flex-row sm:items-start" aria-label="Request progress">
      {ARB_PROGRESS_STEPS.map((step, i) => {
        const done = i < current || status === "COMPLETED";
        const active = i === current && status !== "COMPLETED";
        const cut = denied && i > current;
        const label = i === 2 && current === 2 ? ARB_STATUS_LABELS[status] : i === 1 && status === "MORE_INFO_NEEDED" ? "More Info Needed" : step.label;
        return (
          <li key={step.key} className={cn("flex flex-1 items-center gap-3 sm:flex-col sm:gap-2 sm:text-center", cut && "opacity-40")}>
            <div className="flex flex-col items-center sm:w-full sm:flex-row">
              <span className={cn("hidden h-0.5 flex-1 sm:block", i === 0 ? "invisible" : done || active ? "bg-navy-700" : "bg-slate-200")} />
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                  done && "border-navy-700 bg-navy-700 text-white",
                  active && !denied && (status === "MORE_INFO_NEEDED" || status === "AWAITING_BUILDING_PERMIT" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-navy-700 bg-white text-navy-800"),
                  active && denied && "border-red-600 bg-red-50 text-red-700",
                  !done && !active && "border-slate-300 bg-white text-slate-400",
                )}
                aria-current={active ? "step" : undefined}
              >
                {done ? <Check className="size-4" /> : active && denied ? <X className="size-4" /> : i + 1}
              </span>
              <span className={cn("hidden h-0.5 flex-1 sm:block", i === ARB_PROGRESS_STEPS.length - 1 ? "invisible" : done ? "bg-navy-700" : "bg-slate-200")} />
              {i < ARB_PROGRESS_STEPS.length - 1 && <span className={cn("h-5 w-0.5 sm:hidden", done ? "bg-navy-700" : "bg-slate-200")} />}
            </div>
            <span className={cn("pb-5 text-sm sm:pb-0 sm:text-xs", active ? "font-semibold text-navy-900" : done ? "text-slate-700" : "text-slate-400")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

type Doc = { id: string; originalFilename: string; fileSize: number; arbDocType: string | null; createdAt: Date; uploadedByResident: string | null; mimeType: string };

/** Checklist of the ARB document types with their files. `href` builds view/download links for the audience. */
export function ArbDocChecklist({
  documents, href, timeZone, renderUpload, showPermitAlways,
}: {
  documents: Doc[];
  href: (docId: string, inline: boolean) => string;
  timeZone: string;
  renderUpload?: (type: ArbDocTypeKey) => React.ReactNode;
  showPermitAlways?: boolean;
}) {
  const types = Object.keys(ARB_DOC_TYPES) as ArbDocTypeKey[];
  return (
    <ul className="flex flex-col gap-3">
      {types.map((t) => {
        const docs = documents.filter((d) => (d.arbDocType ?? "OTHER") === t);
        const expected = t !== "OTHER" && (t !== "BUILDING_PERMIT" || showPermitAlways);
        return (
          <li key={t} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-navy-900">{ARB_DOC_TYPES[t].label}</p>
                <p className="text-sm text-slate-500">{ARB_DOC_TYPES[t].help}</p>
              </div>
              {docs.length > 0 ? (
                <Badge tone="green"><Check className="mr-1 size-3" />{docs.length} file{docs.length === 1 ? "" : "s"}</Badge>
              ) : expected ? (
                <Badge tone="amber"><CircleAlert className="mr-1 size-3" />Missing</Badge>
              ) : (
                <Badge>None yet</Badge>
              )}
            </div>
            {docs.length > 0 && (
              <ul className="mt-3 divide-y rounded-lg border">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 p-2.5 text-sm">
                    <FileText className="size-4 shrink-0 text-navy-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{d.originalFilename}</p>
                      <p className="text-xs text-slate-500">{formatBytes(d.fileSize)} · {formatDateTime(d.createdAt, timeZone)}{d.uploadedByResident ? " · from resident" : " · from the board"}</p>
                    </div>
                    <a href={href(d.id, true)} target="_blank" rel="noopener" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`View ${d.originalFilename}`}><Eye className="size-4" /></a>
                    <a href={href(d.id, false)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label={`Download ${d.originalFilename}`}><Download className="size-4" /></a>
                  </li>
                ))}
              </ul>
            )}
            {renderUpload && <div className="mt-3">{renderUpload(t)}</div>}
          </li>
        );
      })}
    </ul>
  );
}

type Event = { id: string; kind: string; fromStatus: string | null; toStatus: string | null; message: string | null; visibleToResident: boolean; actorName: string; createdAt: Date };

export function ArbTimeline({ events, timeZone, showInternal }: { events: Event[]; timeZone: string; showInternal: boolean }) {
  const list = events.filter((e) => showInternal || e.visibleToResident).slice().reverse();
  if (!list.length) return <p className="text-sm text-slate-500">No activity yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {list.map((e) => (
        <li key={e.id} className={cn("rounded-xl border p-3 text-sm", !e.visibleToResident ? "border-dashed border-slate-300 bg-slate-50" : e.kind === "RESIDENT" ? "border-blue-100 bg-blue-50/50" : "border-slate-200 bg-white")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
              {!e.visibleToResident ? <Lock className="size-3.5 text-slate-500" /> : <MessageSquare className="size-3.5 text-navy-600" />}
              {e.actorName}
              {!e.visibleToResident && <span className="text-xs font-normal text-slate-500">Internal note — not shown to resident</span>}
              {e.toStatus && e.fromStatus !== e.toStatus && (
                <span className="flex items-center gap-1 text-xs font-normal text-slate-600">
                  {e.fromStatus ? "moved to" : ""} <ArbStatusBadge status={e.toStatus as ArbStatusKey} />
                </span>
              )}
            </span>
            <span className="text-xs text-slate-500">{formatDateTime(e.createdAt, timeZone)}</span>
          </div>
          {e.message && <p className="prose-minutes mt-1.5 text-sm">{e.message}</p>}
        </li>
      ))}
    </ol>
  );
}
