import { getRouteActor } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf";
import { toMinutesRecord } from "@/lib/minutes-record";
import { carriedForwardTasks, loadMinutes } from "@/server/loaders";
import { buildMinutesPdf } from "@/server/pdf-builders";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRouteActor();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  let m;
  try {
    m = await loadMinutes(actor, (await params).id); // drafts only for leadership
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const org = await getOrganization();
  const carried = await carriedForwardTasks(m.meeting.committeeId, m.meetingId, m.meeting.meetingDate);
  const buf = await buildMinutesPdf(org.name, toMinutesRecord(m), carried, org.timezone);
  const date = m.meeting.meetingDate.toISOString().slice(0, 10);
  return pdfResponse(buf, `${m.meeting.committee.name} Minutes ${date}${m.status === "PUBLISHED" ? "" : " DRAFT"}.pdf`);
}
