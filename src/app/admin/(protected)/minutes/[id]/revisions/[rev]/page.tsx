import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { isUuid, loadMinutes } from "@/server/loaders";
import { PageHeader } from "@/components/common";
import { PrintButton } from "@/components/print-button";
import { formatDateTime } from "@/lib/format";
import { toMinutesRecord } from "@/lib/minutes-record";
import { MinutesDocument } from "@/views/minutes-document";

export const metadata = { title: "Minutes Revision" };

export default async function RevisionPage({ params }: { params: Promise<{ id: string; rev: string }> }) {
  const admin = await requireAdmin();
  const { id, rev } = await params;
  if (!isUuid(id) || !/^\d+$/.test(rev)) notFound();
  await loadMinutes(admin, id); // 404 unless these minutes belong to this HOA
  const org = await getOrganization();
  const r = await db.meetingMinuteRevision.findUnique({ where: { minutesId_revisionNumber: { minutesId: id, revisionNumber: Number(rev) } } });
  if (!r) notFound();
  const record = toMinutesRecord(r.snapshotJson as Record<string, unknown>);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        back={{ href: `/admin/minutes/${id}`, label: "Current minutes" }}
        title={`Revision ${r.revisionNumber}`}
        description={`${r.changeReason ?? ""} · ${r.changedByName ?? "—"} · ${formatDateTime(r.createdAt, org.timezone)}`}
        actions={<PrintButton />}
      />
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This is a historical snapshot, preserved for the record. It cannot be edited.</div>
      <MinutesDocument r={record} timeZone={org.timezone} />
    </div>
  );
}
