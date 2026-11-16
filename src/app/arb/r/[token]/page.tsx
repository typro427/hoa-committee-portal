import { notFound } from "next/navigation";
import { CheckCircle2, HardHat, PartyPopper, Upload } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyLink } from "@/components/copy-link";
import { Textarea } from "@/components/ui/form";
import { ACCEPT_ATTR } from "@/lib/storage";
import { getOrganizationSafe } from "@/lib/org";
import { publicBaseUrl } from "@/lib/url";
import { ARB_DOC_TYPES, ARB_PROJECT_LABELS, ARB_STATUS_HELP, UTILITY_LABELS, type ArbDocTypeKey } from "@/lib/arb";
import { formatDate, formatDateTime } from "@/lib/format";
import { loadArbByToken } from "@/server/arb";
import { residentMessage, residentProgress, residentUpload } from "@/server/arb-actions";
import { ArbDocChecklist, ArbProgress, ArbStatusBadge, ArbTimeline } from "@/views/arb-parts";

export const metadata = { title: "Your Architectural Request", referrer: "no-referrer" };

export default async function ResidentTrackingPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ new?: string; progress?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const isNew = sp.new === "1";
  const r = await loadArbByToken(token);
  if (!r) notFound();
  const org = await getOrganizationSafe();
  const tz = org?.timezone ?? "America/New_York";
  const closed = r.status === "COMPLETED" || r.status === "DENIED";
  const approved = r.status === "APPROVED" || r.status === "APPROVED_WITH_CONDITIONS";
  const permitStage = r.status === "AWAITING_BUILDING_PERMIT";
  const hasPermit = r.documents.some((d) => d.arbDocType === "BUILDING_PERMIT");
  const myLink = `${await publicBaseUrl()}/arb/r/${token}`;
  const docHref = (id: string, inline: boolean) => `/api/arb/${token}/documents/${id}${inline ? "?inline=1" : ""}`;

  const uploadFor = (type: ArbDocTypeKey) =>
    closed ? null : (
      <ActionForm action={residentUpload} resetOnSuccess className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="docType" value={type} />
        <input name="file" type="file" multiple required accept={ACCEPT_ATTR} aria-label={`Upload ${ARB_DOC_TYPES[type].label}`} className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold file:text-navy-800" />
        <SubmitButton size="sm" variant={type === "BUILDING_PERMIT" && permitStage ? "default" : "secondary"} pendingText="Uploading…" className="shrink-0"><Upload /> Upload</SubmitButton>
      </ActionForm>
    );

  return (
    <div className="flex flex-col gap-5">
      {isNew && (
        <section className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 sm:p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-emerald-900"><CheckCircle2 className="size-6" /> Request submitted</p>
          <p className="mt-1 text-sm text-emerald-900">
            Your reference number is <b>{r.referenceNumber}</b>. <b>Save this page&apos;s link</b>: it&apos;s your private way to check progress, read the board&apos;s
            messages, and upload more documents. Anyone with the link can see this request, so share it only with people you trust (like your contractor).
          </p>
          <div className="mt-3"><CopyLink url={myLink} /></div>
          <p className="mt-2 text-xs text-emerald-800">Tip: bookmark this page, or text or email the link to yourself.</p>
        </section>
      )}

      {(sp.progress === "started" || sp.progress === "finished") && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          {sp.progress === "started"
            ? "Thanks! The board now knows construction has started. When you're finished, come back and tap “Construction is finished”."
            : hasPermit
              ? "Thanks! The board will review your building permit and close your request."
              : "Thanks! Now upload your building permit in the Building permit section below so the board can close your request."}
        </p>
      )}

      <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">{r.referenceNumber}</p>
            <h1 className="text-xl font-bold text-navy-900 break-words">{r.propertyAddress}</h1>
            <p className="text-sm text-slate-600">{ARB_PROJECT_LABELS[r.projectType]} · Submitted {formatDate(r.createdAt, "medium")}</p>
          </div>
          <ArbStatusBadge status={r.status} />
        </div>
        <div className="mt-5"><ArbProgress status={r.status} /></div>
        <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{ARB_STATUS_HELP[r.status]}</p>
        {r.decisionNotes && (
          <div className={`mt-3 rounded-lg border p-3 text-sm ${r.status === "DENIED" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            <p className="font-semibold">{r.status === "DENIED" ? "Reason" : r.status === "APPROVED" ? "Notes from the board" : "Conditions of approval"}</p>
            <p className="prose-minutes">{r.decisionNotes}</p>
            {r.decidedAt && <p className="mt-1 text-xs opacity-80">Decided {formatDateTime(r.decidedAt, tz)}{r.decidedByName ? ` by ${r.decidedByName}` : ""}</p>}
          </div>
        )}
      </section>

      {(approved || r.status === "CONSTRUCTION_IN_PROGRESS" || permitStage) && (
        <section className="rounded-xl border border-navy-100 bg-navy-50/60 p-4 sm:p-5">
          <h2 className="mb-2 font-semibold text-navy-900">Update your progress</h2>
          {permitStage ? (
            <p className="text-sm text-slate-700">
              {hasPermit ? "Thanks — your building permit is uploaded. The board will review it and close your request." : <>Construction is finished. <b>Upload your building permit</b> in the Building permit section below so the board can close your request.</>}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {approved && (
                <ActionForm action={residentProgress}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="step" value="started" />
                  <SubmitButton variant="secondary"><HardHat /> Construction has started</SubmitButton>
                </ActionForm>
              )}
              <ActionForm action={residentProgress} confirm="Mark construction as finished? You'll then upload your building permit.">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="step" value="finished" />
                <SubmitButton><PartyPopper /> Construction is finished</SubmitButton>
              </ActionForm>
            </div>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-navy-900">Documents</h2>
        <ArbDocChecklist documents={r.documents} href={docHref} timeZone={tz} renderUpload={uploadFor} showPermitAlways={permitStage || r.status === "CONSTRUCTION_IN_PROGRESS"} />
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm sm:p-5">
        <h2 className="mb-3 text-lg font-semibold text-navy-900">Messages &amp; history</h2>
        {!closed && (
          <ActionForm action={residentMessage} resetOnSuccess className="mb-4 flex flex-col gap-2">
            <input type="hidden" name="token" value={token} />
            <Textarea name="message" rows={3} required placeholder="Send a message or answer a question from the board…" aria-label="Message to the board" />
            <div><SubmitButton size="sm" variant="secondary">Send message</SubmitButton></div>
          </ActionForm>
        )}
        <ArbTimeline events={r.events} timeZone={tz} showInternal={false} />
      </section>

      <details className="rounded-xl border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer font-semibold text-navy-900">Request details</summary>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Item k="Applicant" v={r.applicantName} />
          <Item k="Lot" v={r.lotNumber} />
          <Item k="Contractor" v={r.contractorName} />
          <Item k="Estimated dates" v={[r.estimatedStart && formatDate(r.estimatedStart, "short"), r.estimatedFinish && formatDate(r.estimatedFinish, "short")].filter(Boolean).join(" – ") || null} />
          <Item k="Utilities" v={`Water: ${UTILITY_LABELS[r.waterLine]} · Gas: ${UTILITY_LABELS[r.gasLine]} · Electric: ${UTILITY_LABELS[r.electricLine]}`} />
          <Item k="Utility notes" v={r.utilityNotes} />
          <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Description</dt><dd className="prose-minutes text-sm">{r.description}</dd></div>
        </dl>
      </details>
      {!isNew && <div className="rounded-xl border bg-white p-4 text-sm text-slate-600"><p className="mb-2">Your private link to this page:</p><CopyLink url={myLink} /></div>}
    </div>
  );
}

function Item({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <dt className="font-semibold text-slate-500">{k}</dt>
      <dd className="text-slate-900">{v || "—"}</dd>
    </div>
  );
}
