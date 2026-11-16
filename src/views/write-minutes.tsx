import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FileText, Video } from "lucide-react";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/session";
import { can } from "@/lib/permissions";
import { getOrganization } from "@/lib/org";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, MinutesStatusBadge, PageHeader, ScopeInput, Section } from "@/components/common";
import { ZoomImport } from "@/components/zoom-import";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Options, Select } from "@/components/ui/form";
import { formatDate, isoToDate, MEETING_TYPE_LABELS, todayISO } from "@/lib/format";
import { applyZoomImport, parseZoomUpload, startMinutes } from "@/server/zoom-actions";
import { committeeRoster, loadMinutes } from "@/server/loaders";

/** "Write minutes": pick a meeting (or record a new one), then write from scratch or import Zoom notes. */
export async function WriteMinutesView({ actor }: { actor: Actor }) {
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  if (actor.kind === "member" && !can.createMinutes(actor, actor.committeeId)) notFound();
  const org = await getOrganization();
  const today = todayISO(org.timezone);
  const soon = new Date(isoToDate(today).getTime() + 2 * 86400_000);
  const committees = actor.kind === "admin" ? await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" } }) : [];
  const meetings = await db.meeting.findMany({
    where: {
      committeeId: actor.kind === "member" ? actor.committeeId : undefined,
      committee: { organizationId: org.id, status: "ACTIVE" },
      meetingDate: { lte: soon },
      status: { not: "CANCELLED" },
      OR: [{ minutes: null }, { minutes: { status: { not: "PUBLISHED" } } }],
    },
    include: { committee: { select: { name: true } }, minutes: { select: { id: true, status: true } } },
    orderBy: { meetingDate: "desc" },
    take: 15,
  });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: `${base}/minutes`, label: "Meeting Minutes" }} title="Write Minutes" description="Choose the meeting, then write the minutes yourself or start from your Zoom notes." />
      <Section title="Which meeting?">
        {meetings.length === 0 ? (
          <EmptyState>No recent meetings need minutes. Record the meeting below.</EmptyState>
        ) : (
          <ul className="divide-y rounded-lg border">
            {meetings.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-900">{formatDate(m.meetingDate, "medium")} — {m.title}</p>
                  <p className="text-sm text-slate-500">
                    {actor.kind === "admin" ? `${m.committee.name} · ` : ""}{MEETING_TYPE_LABELS[m.meetingType]}
                    {m.minutes && <> · <MinutesStatusBadge status={m.minutes.status} /></>}
                  </p>
                </div>
                {m.minutes ? (
                  <div className="flex gap-2">
                    <Link href={`${base}/minutes/${m.minutes.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}><FileText /> Continue</Link>
                    <Link href={`${base}/minutes/${m.minutes.id}/import`} className={buttonVariants({ size: "sm" })}><Video /> Import Zoom</Link>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <StartButton scope={scope} meetingId={m.id} then="edit" />
                    <StartButton scope={scope} meetingId={m.id} then="zoom" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Meeting not listed? Record it here">
        <ActionForm action={startMinutes} className="grid gap-3 sm:grid-cols-2">
          <ScopeInput scope={scope} />
          {actor.kind === "admin" && (
            <Field label="Committee" htmlFor="wm-committee" className="sm:col-span-2">
              <Select id="wm-committee" name="committeeId" required defaultValue="">
                <option value="">Choose a committee…</option>
                {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Meeting title" htmlFor="wm-title" className="sm:col-span-2"><Input id="wm-title" name="title" required defaultValue="Committee Meeting" /></Field>
          <Field label="Meeting date" htmlFor="wm-date"><Input id="wm-date" name="meetingDate" type="date" required defaultValue={today} /></Field>
          <Field label="Start time (optional)" htmlFor="wm-time"><Input id="wm-time" name="startTime" type="time" /></Field>
          <Field label="Meeting type" htmlFor="wm-type"><Select id="wm-type" name="meetingType" defaultValue="REGULAR"><Options labels={MEETING_TYPE_LABELS} /></Select></Field>
          <div className="flex flex-wrap items-end gap-2">
            <SubmitButton name="then" value="zoom" pendingText="Creating…"><Video /> Import Zoom notes</SubmitButton>
            <SubmitButton name="then" value="edit" variant="outline" pendingText="Creating…"><FileText /> Write from scratch</SubmitButton>
          </div>
        </ActionForm>
      </Section>
    </div>
  );
}

function StartButton({ scope, meetingId, then }: { scope: string; meetingId: string; then: "edit" | "zoom" }) {
  return (
    <ActionForm action={startMinutes}>
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="then" value={then} />
      <SubmitButton size="sm" variant={then === "zoom" ? "default" : "outline"} pendingText="…">
        {then === "zoom" ? <><Video /> Import Zoom</> : <><FileText /> Write</>}
      </SubmitButton>
    </ActionForm>
  );
}

export async function ZoomImportView({ actor, minutesId }: { actor: Actor; minutesId: string }) {
  const scope = actor.kind === "admin" ? "admin" : "portal";
  const base = actor.kind === "admin" ? "/admin" : "/portal";
  const m = await loadMinutes(actor, minutesId);
  if (m.status === "PUBLISHED") redirect(`${base}/minutes/${m.id}`);
  if (!can.createMinutes(actor, m.meeting.committeeId)) notFound();
  const roster = (await committeeRoster(m.meeting.committeeId)).map((r) => ({ id: r.id, name: r.name }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `${base}/minutes/${m.id}`, label: "Back to minutes" }}
        title="Import from Zoom"
        description={`${formatDate(m.meeting.meetingDate, "medium")} — ${m.meeting.title}${actor.kind === "admin" ? ` · ${m.meeting.committee.name}` : ""}`}
      />
      <ZoomImport currentMemberId={actor.kind === "member" ? actor.memberId : null} scope={scope} minutesId={m.id} roster={roster} parseAction={parseZoomUpload} applyAction={applyZoomImport} cancelHref={`${base}/minutes/${m.id}`} />
    </div>
  );
}
