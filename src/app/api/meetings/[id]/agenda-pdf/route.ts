import { getRouteActor } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { pdfResponse } from "@/lib/pdf";
import { isNativeApp } from "@/lib/native-app";
import { loadMeeting } from "@/server/loaders";
import { buildAgendaPdf } from "@/server/pdf-builders";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getRouteActor();
  if (!actor) return new Response("Please sign in.", { status: 401 });
  let m;
  try {
    m = await loadMeeting(actor, (await params).id);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const org = await getOrganization();
  const buf = await buildAgendaPdf(org.name, m);
  return pdfResponse(buf, `${m.committee.name} Agenda ${m.meetingDate.toISOString().slice(0, 10)}.pdf`, await isNativeApp());
}
