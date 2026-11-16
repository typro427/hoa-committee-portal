import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, ExternalLink, FileCheck2, Plus, Search, Upload } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { publicBaseUrl } from "@/lib/url";
import { ACCEPT_ATTR } from "@/lib/storage";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { ResetLinkForm } from "@/components/reset-link-form";
import { EmptyState, PageHeader, ScopeInput, Section, Tabs } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import {
  ARB_DOC_TYPES, ARB_LIST_GROUPS, ARB_PROJECT_LABELS, ARB_REQUIRED_AT_SUBMISSION, ARB_STATUS_LABELS, UTILITY_LABELS,
  type ArbDocTypeKey,
} from "@/lib/arb";
import { formatDate, formatDateTime } from "@/lib/format";
import { addArbNote, resetArbLink, staffArbUpload, staffCreateArbRequest, updateArbStatus } from "@/server/arb-actions";
import { arbCommittee, loadArbForActor } from "@/server/arb";
import { ArbDocChecklist, ArbProgress, ArbStatusBadge, ArbTimeline } from "./arb-parts";
import { ArbRequestForm } from "./arb-form";

type SP = { group?: string; q?: string };

/** Members can only use ARB pages while their active committee reviews ARB requests. */
async function arbScope(actor: Actor) {
  if (actor.kind === "admin") return (await arbCommittee())?.id ?? null;
  const c = await db.committee.findUnique({ where: { id: actor.committeeId }, select: { handlesArbRequests: true } });
  if (!c?.handlesArbRequests) notFound();
  return actor.committeeId;
}

export async function ArbListView({ actor, sp }: { actor: Actor; sp: SP }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const org = await getOrganization();
  const committeeId = await arbScope(actor);
  const group = ARB_LIST_GROUPS.find((g) => g.key === sp.group) ?? ARB_LIST_GROUPS[0];
  const where: Prisma.ArbRequestWhereInput = {
    committee: { organizationId: org.id },
    ...(actor.kind === "member" ? { committeeId: actor.committeeId } : {}),
    ...(sp.q ? { OR: [
      { propertyAddress: { contains: sp.q, mode: "insensitive" } },
      { applicantName: { contains: sp.q, mode: "insensitive" } },
      { referenceNumber: { contains: sp.q, mode: "insensitive" } },
      { lotNumber: { contains: sp.q, mode: "insensitive" } },
    ] } : {}),
  };
  const counts = await Promise.all(ARB_LIST_GROUPS.map((g) => db.arbRequest.count({ where: { ...where, status: { in: g.statuses } } })));
  const requests = await db.arbRequest.findMany({
    where: { ...where, status: { in: group.statuses } },
    include: { documents: { where: { removedAt: null }, select: { arbDocType: true } }, events: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, kind: true } } },
    orderBy: group.key === "closed" ? { updatedAt: "desc" } : { createdAt: "asc" },
    take: 300,
  });
  const qs = (o: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]);
    return `${base}/arb?${p}`;
  };
  const manage = committeeId ? can.manageArb(actor, committeeId) : false;
  const publicUrl = `${await publicBaseUrl()}/arb`;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ARB Requests"
        description="Architectural requests from residents: review plans, track progress, and confirm building permits."
        actions={manage && <Link href={`${base}/arb/new`} className={buttonVariants()}><Plus /> Enter a request</Link>}
      />
      {!committeeId ? (
        <EmptyState>
          No committee is set to receive ARB requests. Open <Link className="underline" href="/admin/committees">Committees</Link>, choose the Architectural Review Board, and turn on “Receives architectural requests”.
        </EmptyState>
      ) : (
        <>
          <details className="rounded-xl border bg-white p-3 text-sm shadow-sm">
            <summary className="flex cursor-pointer items-center gap-2 font-semibold text-navy-900"><ExternalLink className="size-4" /> Resident request form link</summary>
            <p className="my-2 text-slate-600">Share this on the HOA website, newsletter, or by text. Residents don&apos;t need a PIN.</p>
            <CopyLink url={publicUrl} />
          </details>
          <Tabs current={group.key} tabs={ARB_LIST_GROUPS.map((g, i) => ({ key: g.key, label: g.label, href: qs({ group: g.key === "review" ? undefined : g.key }), count: counts[i] }))} />
          <form action={`${base}/arb`} className="flex gap-2">
            {sp.group && <input type="hidden" name="group" value={sp.group} />}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input name="q" defaultValue={sp.q} placeholder="Search address, name, lot, or ARB number" className="pl-9" aria-label="Search requests" />
            </div>
            <button className={buttonVariants({ variant: "outline" })}>Search</button>
          </form>
          {requests.length === 0 ? (
            <EmptyState>{sp.q ? "No requests match your search." : "No requests here."}</EmptyState>
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((r) => {
                const have = new Set(r.documents.map((d) => d.arbDocType));
                const missing = ARB_REQUIRED_AT_SUBMISSION.filter((t) => !have.has(t)).length;
                const permitIn = have.has("BUILDING_PERMIT");
                const residentReplied = r.events[0]?.kind === "RESIDENT" || r.events[0]?.kind === "DOCUMENT";
                return (
                  <li key={r.id}>
                    <Link href={`${base}/arb/${r.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-navy-300">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-500">{r.referenceNumber}</p>
                          <p className="font-semibold text-navy-900">{r.propertyAddress}</p>
                          <p className="text-sm text-slate-600">{r.applicantName} · {ARB_PROJECT_LABELS[r.projectType]}</p>
                        </div>
                        <ArbStatusBadge status={r.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span className="text-slate-500">Submitted {formatDate(r.createdAt, "short")}</span>
                        {missing > 0 && r.status !== "DENIED" && r.status !== "COMPLETED" && <span className="flex items-center gap-1 font-medium text-amber-700"><CircleAlert className="size-3.5" />{missing} expected document{missing === 1 ? "" : "s"} missing</span>}
                        {r.status === "AWAITING_BUILDING_PERMIT" && (permitIn ? <span className="flex items-center gap-1 font-medium text-emerald-700"><FileCheck2 className="size-3.5" />Permit uploaded: ready to close</span> : <span className="font-medium text-amber-700">Waiting on permit</span>)}
                        {residentReplied && r.status !== "COMPLETED" && <span className="font-medium text-blue-700">New from resident {r.events[0] && formatDateTime(r.events[0].createdAt, org.timezone)}</span>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export async function ArbDetailView({ actor, id, tab, created }: { actor: Actor; id: string; tab?: string; created?: boolean }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const org = await getOrganization();
  if (actor.kind === "member") await arbScope(actor);
  const r = await loadArbForActor(actor, id);
  const manage = can.manageArb(actor, r.committeeId);
  const current = tab === "documents" || tab === "progress" ? tab : "overview";
  const have = new Set(r.documents.map((d) => d.arbDocType));
  const missing = ARB_REQUIRED_AT_SUBMISSION.filter((t) => !have.has(t));
  const tabHref = (t: string) => `${base}/arb/${r.id}${t === "overview" ? "" : `?tab=${t}`}`;
  const hidden = (<><ScopeInput scope={scope} /><input type="hidden" name="requestId" value={r.id} /></>);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        back={{ href: `${base}/arb`, label: "ARB Requests" }}
        title={r.propertyAddress}
        description={<div className="flex flex-wrap items-center gap-2"><span className="font-medium">{r.referenceNumber}</span><ArbStatusBadge status={r.status} /><span>{ARB_PROJECT_LABELS[r.projectType]}</span></div>}
      />
      {created && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          Request created. To let the homeowner follow progress and upload documents, use <b>Create resident link</b> on the Overview tab and send it to them.
        </div>
      )}
      <div className="rounded-xl border bg-white p-4 shadow-sm"><ArbProgress status={r.status} /></div>
      <Tabs
        current={current}
        tabs={[
          { key: "overview", label: "Overview", href: tabHref("overview") },
          { key: "documents", label: "Documents", href: tabHref("documents"), count: r.documents.length },
          { key: "progress", label: "Progress", href: tabHref("progress"), count: r.events.length },
        ]}
      />

      {current === "overview" && (
        <>
          {missing.length > 0 && !["DENIED", "COMPLETED"].includes(r.status) && (
            <Link href={tabHref("documents")} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" /> Missing: {missing.map((m) => ARB_DOC_TYPES[m].label).join(", ")}
            </Link>
          )}
          <Section title="Project">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item k="Type" v={ARB_PROJECT_LABELS[r.projectType]} />
              <Item k="Contractor" v={r.contractorName} />
              <Item k="Estimated start" v={r.estimatedStart ? formatDate(r.estimatedStart, "medium") : null} />
              <Item k="Estimated completion" v={r.estimatedFinish ? formatDate(r.estimatedFinish, "medium") : null} />
              <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Description</dt><dd className="prose-minutes text-sm">{r.description}</dd></div>
            </dl>
          </Section>
          <Section title="Utilities">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <Item k="Water" v={UTILITY_LABELS[r.waterLine]} />
              <Item k="Gas" v={UTILITY_LABELS[r.gasLine]} />
              <Item k="Electric" v={UTILITY_LABELS[r.electricLine]} />
              {r.utilityNotes && <div className="sm:col-span-3"><dt className="font-semibold text-slate-500">Notes</dt><dd className="prose-minutes text-sm">{r.utilityNotes}</dd></div>}
            </dl>
          </Section>
          {r.decisionNotes && (
            <Section title={r.status === "DENIED" ? "Reason for denial" : "Decision notes / conditions"}>
              <p className="prose-minutes text-sm">{r.decisionNotes}</p>
              {r.decidedAt && <p className="mt-2 text-xs text-slate-500">{formatDateTime(r.decidedAt, org.timezone)} · {r.decidedByName}</p>}
            </Section>
          )}
          <Section title="Homeowner">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Item k="Name" v={r.applicantName} />
              <Item k="Lot" v={r.lotNumber} />
              <Item k="Email" v={r.applicantEmail ? <a className="text-navy-700 underline" href={`mailto:${r.applicantEmail}?subject=${encodeURIComponent(`${r.referenceNumber} – ${r.propertyAddress}`)}`}>{r.applicantEmail}</a> : null} />
              <Item k="Phone" v={r.applicantPhone ? <a className="text-navy-700 underline" href={`tel:${r.applicantPhone}`}>{r.applicantPhone}</a> : null} />
              <Item k="Submitted" v={`${formatDateTime(r.createdAt, org.timezone)}${r.submittedByStaff ? ` (entered by ${r.submittedByStaff})` : " (online)"}`} />
              {r.completedAt && <Item k="Completed" v={formatDateTime(r.completedAt, org.timezone)} />}
            </dl>
            {manage && (
              <div className="mt-4 border-t pt-4">
                <p className="mb-2 text-sm text-slate-600">Homeowner lost their tracking link, or you entered this request for them? Create a new private link to send them.</p>
                <ResetLinkForm action={resetArbLink} scope={scope} requestId={r.id} />
              </div>
            )}
          </Section>
        </>
      )}

      {current === "documents" && (
        <>
          <ArbDocChecklist
            documents={r.documents}
            href={(docId, inline) => `/api/documents/${docId}/download${inline ? "?inline=1" : ""}`}
            timeZone={org.timezone}
            showPermitAlways={["CONSTRUCTION_IN_PROGRESS", "AWAITING_BUILDING_PERMIT", "COMPLETED"].includes(r.status)}
          />
          {manage && (
            <Section title="Add a document">
              <ActionForm action={staffArbUpload} resetOnSuccess className="grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
                {hidden}
                <Field label="Type" htmlFor="docType">
                  <Select id="docType" name="docType" defaultValue="OTHER">
                    {(Object.keys(ARB_DOC_TYPES) as ArbDocTypeKey[]).map((t) => <option key={t} value={t}>{ARB_DOC_TYPES[t].label}</option>)}
                  </Select>
                </Field>
                <Field label="File" htmlFor="arb-file"><input id="arb-file" name="file" type="file" multiple required accept={ACCEPT_ATTR} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold file:text-navy-800" /></Field>
                <SubmitButton pendingText="Uploading…"><Upload /> Upload</SubmitButton>
              </ActionForm>
            </Section>
          )}
        </>
      )}

      {current === "progress" && (
        <>
          {manage && (
            <Section title="Update stage">
              <p className="mb-3 text-sm text-slate-600">Current stage: <b>{ARB_STATUS_LABELS[r.status]}</b>. The resident sees each change and any message on their tracking page.</p>
              <ActionForm action={updateArbStatus} className="grid gap-4">
                {hidden}
                <Field label="Stage" htmlFor="status">
                  <Select id="status" name="status" defaultValue={r.status}><Options labels={ARB_STATUS_LABELS} /></Select>
                </Field>
                <Field label="Decision notes (shown to resident)" htmlFor="decisionNotes" hint="Required for “Approved with Conditions” (list the conditions) and “Denied” (give the reason).">
                  <Textarea id="decisionNotes" name="decisionNotes" rows={3} defaultValue={r.decisionNotes ?? ""} />
                </Field>
                <Field label="Message to resident (optional)" htmlFor="message" hint="Required for “More Info Needed”: say exactly what's needed.">
                  <Textarea id="message" name="message" rows={2} />
                </Field>
                <Field label="Internal note (optional, board only)" htmlFor="note"><Textarea id="note" name="note" rows={2} /></Field>
                {!have.has("BUILDING_PERMIT") && (
                  <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="permitWaived" className="mt-0.5 size-4" />
                    <span>No building permit required for this project (lets you mark it Completed without one)</span>
                  </label>
                )}
                <div><SubmitButton>Save</SubmitButton></div>
              </ActionForm>
            </Section>
          )}
          <Section title="Add a note">
            <ActionForm action={addArbNote} resetOnSuccess className="flex flex-col gap-3">
              {hidden}
              <Textarea name="message" rows={3} required placeholder="Comments, review notes, site visit findings…" aria-label="Note" />
              {manage && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="toResident" className="size-4" /> Send to the resident (shows on their tracking page)
                </label>
              )}
              <div><SubmitButton size="sm" variant="secondary">Add</SubmitButton></div>
            </ActionForm>
          </Section>
          <Section title="History">
            <ArbTimeline events={r.events} timeZone={org.timezone} showInternal />
          </Section>
        </>
      )}
    </div>
  );
}

export async function ArbNewView({ actor }: { actor: Actor }) {
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const committeeId = await arbScope(actor);
  if (!committeeId || !can.manageArb(actor, committeeId)) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: `${base}/arb`, label: "ARB Requests" }} title="Enter a request" description="For requests received on paper or by email." />
      <ArbRequestForm action={staffCreateArbRequest} scope={actor.kind === "admin" ? "admin" : "portal"} staff />
    </div>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{k}</dt>
      <dd className="text-slate-900">{v || "—"}</dd>
    </div>
  );
}
