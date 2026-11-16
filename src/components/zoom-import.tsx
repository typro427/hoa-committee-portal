"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ClipboardPaste, FileUp, ListChecks, Loader2, Users, Video } from "lucide-react";
import { FormMessage, type ActionResult } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { mentionedMembers, matchPerson, suggestSection, type ParsedZoomNotes } from "@/lib/zoom-notes";

type Action = (p: ActionResult, fd: FormData) => Promise<ActionResult>;
type Person = { id: string; name: string };

const SECTIONS: [string, string][] = [
  ["callToOrder", "Call to Order"],
  ["previousMinutes", "Approval of Previous Minutes"],
  ["oldBusiness", "Old Business"],
  ["newBusiness", "New Business"],
  ["committeeReports", "Committee Reports"],
  ["projectUpdates", "Project Updates"],
  ["otherBusiness", "Other Discussions"],
  ["recommendations", "Recommendations"],
];

export function ZoomImport({
  scope, minutesId, roster, parseAction, applyAction, cancelHref, currentMemberId = null,
}: {
  scope: "portal" | "admin";
  currentMemberId?: string | null;
  minutesId: string;
  roster: Person[];
  parseAction: Action;
  applyAction: Action;
  cancelHref: string;
}) {
  const [parseState, parse, parsing] = useActionState(parseAction, null);
  const [mode, setMode] = useState<"paste" | "file">("file");
  const data = parseState?.ok ? (parseState.data as { parsed: ParsedZoomNotes; savedDocument: boolean }) : null;

  if (data) {
    return <Review key={JSON.stringify(data.parsed).length} currentMemberId={currentMemberId} scope={scope} minutesId={minutesId} roster={roster} parsed={data.parsed} savedDocument={data.savedDocument} applyAction={applyAction} cancelHref={cancelHref} />;
  }

  return (
    <form action={parse} className="flex flex-col gap-5 rounded-xl border bg-white p-4 shadow-sm sm:p-6">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="minutesId" value={minutesId} />
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Video className="size-5" /></span>
        <div>
          <h2 className="text-lg font-semibold text-navy-900">Import from Zoom notes</h2>
          <p className="text-sm text-slate-600">
            Use the AI Companion meeting summary Zoom creates after the meeting. You&apos;ll review everything before it&apos;s added to the minutes.
          </p>
        </div>
      </div>
      <div className="flex w-fit rounded-lg bg-slate-100 p-1">
        {(["file", "paste"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium", mode === m ? "bg-white text-navy-900 shadow-sm" : "text-slate-600")}>
            {m === "file" ? <><FileUp className="size-4" /> Upload file</> : <><ClipboardPaste className="size-4" /> Paste text</>}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center hover:border-navy-300">
            <FileUp className="size-8 text-slate-400" />
            <span className="text-sm text-slate-600">Choose the Zoom notes <b>PDF</b> (or a .txt / .vtt transcript)</span>
            <input name="file" type="file" accept=".pdf,.txt,.vtt" required className="block w-full max-w-xs text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold file:text-navy-800" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="attach" defaultChecked className="size-4" /> Also save the original file in this meeting&apos;s documents
          </label>
        </div>
      ) : (
        <div>
          <Textarea name="text" rows={10} required placeholder={"Paste the Zoom meeting summary here — from the Zoom email, Zoom Docs, or the Zoom web portal.\n\nQuick recap\n…\nNext steps\n…\nSummary\n…"} />
          <p className="mt-1 text-xs text-slate-500">Tip: in the Zoom summary email or Zoom Docs, select all of the text and copy it.</p>
        </div>
      )}
      <FormMessage state={parseState} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={parsing}>{parsing ? <><Loader2 className="animate-spin" /> Reading notes…</> : "Read notes"}</Button>
        <a href={cancelHref} className="inline-flex h-11 items-center px-3 text-sm font-medium text-slate-600 hover:text-navy-700">Cancel</a>
      </div>
    </form>
  );
}

type BlockState = { key: string; label: string; title: string | null; body: string; section: string };
type ActionState = { include: boolean; text: string; assigneeId: string; dueDate: string; priority: string; owner: string | null };

function Review({ scope, minutesId, roster, parsed, savedDocument, applyAction, cancelHref, currentMemberId }: {
  currentMemberId: string | null;
  scope: "portal" | "admin"; minutesId: string; roster: Person[]; parsed: ParsedZoomNotes; savedDocument: boolean; applyAction: Action; cancelHref: string;
}) {
  const [applyState, apply, applying] = useActionState(applyAction, null);
  const initialBlocks: BlockState[] = useMemo(() => [
    ...(parsed.recap ? [{ key: "recap", label: "Quick recap", title: null, body: parsed.recap, section: parsed.topics.length ? "skip" : "newBusiness" }] : []),
    ...parsed.topics.map((t, i) => ({ key: `t${i}`, label: t.title ?? "Notes", title: t.title, body: t.body, section: suggestSection(t.title) })),
  ], [parsed]);
  const [blocks, setBlocks] = useState(initialBlocks);
  const [actions, setActions] = useState<ActionState[]>(() =>
    parsed.actions.map((a) => ({ include: true, text: a.text.slice(0, 300), assigneeId: matchPerson(a.owner, roster, currentMemberId)?.id ?? "", dueDate: "", priority: "NORMAL", owner: a.owner })),
  );
  const allText = [parsed.recap, ...parsed.topics.map((t) => t.body), ...parsed.actions.map((a) => `${a.owner ?? ""} ${a.text}`)].join("\n");
  const [present, setPresent] = useState<Set<string>>(() => new Set(mentionedMembers(allText, roster, currentMemberId).map((r) => r.id)));

  const setBlock = (i: number, patch: Partial<BlockState>) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const setAction = (i: number, patch: Partial<ActionState>) => setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const useRecapOnly = () => setBlocks((bs) => bs.map((b) => ({ ...b, section: b.key === "recap" ? "newBusiness" : "skip" })));
  const useDetailed = () => setBlocks(initialBlocks);

  const payload = JSON.stringify({
    blocks: blocks.filter((b) => b.section !== "skip").map((b) => ({ section: b.section, title: b.title, body: b.body })),
    actions: actions.filter((a) => a.include && a.text.trim().length > 2).map((a) => ({ text: a.text.trim(), assigneeId: a.assigneeId || null, dueDate: a.dueDate || null, priority: a.priority })),
    presentIds: [...present],
  });
  const includedBlocks = blocks.filter((b) => b.section !== "skip").length;
  const includedActions = actions.filter((a) => a.include).length;

  return (
    <form action={apply} className="flex flex-col gap-5">
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="minutesId" value={minutesId} />
      <input type="hidden" name="payload" value={payload} />

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-5" /> Read {parsed.title ? `“${parsed.title}”` : "your notes"}</p>
        <p className="mt-1">
          Found {parsed.recap ? "a quick recap, " : ""}{parsed.topics.length} discussion topic{parsed.topics.length === 1 ? "" : "s"} and {parsed.actions.length} next step{parsed.actions.length === 1 ? "" : "s"}.
          {savedDocument && " The original file was saved to this meeting's documents."}
          {!parsed.recognized && " These don't look like standard Zoom notes, so everything is in one block below — choose where it goes."}
        </p>
      </div>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
          <h2 className="font-semibold text-navy-900">1. Discussion → minutes sections</h2>
          {parsed.recap && parsed.topics.length > 0 && (
            <div className="flex gap-1 text-sm">
              <button type="button" onClick={useDetailed} className="rounded-md px-2.5 py-1.5 font-medium text-navy-700 hover:bg-navy-50">Detailed topics</button>
              <button type="button" onClick={useRecapOnly} className="rounded-md px-2.5 py-1.5 font-medium text-navy-700 hover:bg-navy-50">Short (recap only)</button>
            </div>
          )}
        </div>
        <ul className="divide-y">
          {blocks.map((b, i) => (
            <li key={b.key} className={cn("flex flex-col gap-2 p-4 sm:px-5", b.section === "skip" && "bg-slate-50")}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className={cn("font-semibold", b.section === "skip" ? "text-slate-400" : "text-slate-900")}>{b.label}</p>
                <Select value={b.section} onChange={(e) => setBlock(i, { section: e.target.value })} className="h-10 sm:w-60" aria-label={`Section for ${b.label}`}>
                  <option value="skip">Don&apos;t include</option>
                  {SECTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </div>
              {b.section !== "skip" && (
                <details>
                  <summary className="cursor-pointer text-sm text-slate-600"><span className="line-clamp-2 inline">{b.body.slice(0, 220)}{b.body.length > 220 ? "…" : ""}</span> <span className="font-medium text-navy-700">Edit</span></summary>
                  <Textarea value={b.body} onChange={(e) => setBlock(i, { body: e.target.value })} rows={6} className="mt-2" aria-label={`Text for ${b.label}`} />
                </details>
              )}
            </li>
          ))}
          {blocks.length === 0 && <li className="p-4 text-sm text-slate-500">No discussion text was found.</li>}
        </ul>
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
          <ListChecks className="size-5 text-navy-700" />
          <h2 className="font-semibold text-navy-900">2. Next steps → action items</h2>
        </div>
        {actions.length === 0 ? <p className="p-4 text-sm text-slate-500">No next steps were found.</p> : (
          <ul className="divide-y">
            {actions.map((a, i) => (
              <li key={i} className={cn("flex gap-3 p-4 sm:px-5", !a.include && "bg-slate-50")}>
                <input type="checkbox" checked={a.include} onChange={(e) => setAction(i, { include: e.target.checked })} className="mt-3 size-5 shrink-0" aria-label="Include this action item" />
                <div className={cn("grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_180px_150px_120px]", !a.include && "opacity-50")}>
                  <Input value={a.text} onChange={(e) => setAction(i, { text: e.target.value })} disabled={!a.include} aria-label="Task" className="sm:col-span-4" />
                  <Select value={a.assigneeId} onChange={(e) => setAction(i, { assigneeId: e.target.value })} disabled={!a.include} aria-label="Assigned to" className="h-10">
                    <option value="">{a.owner ? `Unassigned (Zoom: ${a.owner})` : "Unassigned"}</option>
                    {roster.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                  <Input type="date" value={a.dueDate} onChange={(e) => setAction(i, { dueDate: e.target.value })} disabled={!a.include} aria-label="Due date" className="h-10" />
                  <Select value={a.priority} onChange={(e) => setAction(i, { priority: e.target.value })} disabled={!a.include} aria-label="Priority" className="h-10">
                    <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
                  </Select>
                </div>
              </li>
            ))}
          </ul>
        )}
        {actions.some((a) => a.owner && !matchPerson(a.owner, roster, currentMemberId)) && (
          <p className="border-t px-4 py-3 text-xs text-slate-500 sm:px-5">Some people named in Zoom aren&apos;t on this committee&apos;s roster, so their items start unassigned.</p>
        )}
      </section>

      <section className="rounded-xl border bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
          <Users className="size-5 text-navy-700" />
          <h2 className="font-semibold text-navy-900">3. Mark as present</h2>
        </div>
        <div className="p-4 sm:px-5">
          <p className="mb-3 text-sm text-slate-600">Pre-checked for members named in the notes. Zoom doesn&apos;t list everyone who attended, so check anyone else who was there.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {roster.map((r) => (
              <label key={r.id} className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm">
                <input type="checkbox" checked={present.has(r.id)} onChange={(e) => setPresent((p) => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} className="size-4" />
                {r.name}
              </label>
            ))}
          </div>
        </div>
      </section>

      <FormMessage state={applyState} />
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <Button type="submit" size="lg" disabled={applying || (includedBlocks === 0 && includedActions === 0 && present.size === 0)}>
          {applying ? <><Loader2 className="animate-spin" /> Adding…</> : "Add to minutes"}
        </Button>
        <span className="text-sm text-slate-600">{includedBlocks} section{includedBlocks === 1 ? "" : "s"} · {includedActions} action item{includedActions === 1 ? "" : "s"} · {present.size} present</span>
        <a href={cancelHref} className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-navy-700"><ArrowLeft className="size-4" /> Cancel</a>
      </div>
      <p className="text-xs text-slate-500">Nothing is published. The text is added to the draft minutes for you to review and edit before approving.</p>
    </form>
  );
}
