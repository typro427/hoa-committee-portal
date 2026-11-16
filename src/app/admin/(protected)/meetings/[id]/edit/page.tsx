import { requireAdmin } from "@/lib/session";
import { loadMeeting } from "@/server/loaders";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingForm } from "@/views/meeting-form";

export const metadata = { title: "Edit Meeting" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  const m = await loadMeeting(actor, (await params).id);
  return (
    <>
      <PageHeader back={{ href: `/admin/meetings/${m.id}`, label: "Back to meeting" }} title="Edit Meeting" description={m.committee.name} />
      <Card><CardContent className="pt-5 sm:pt-5"><MeetingForm scope="admin" meeting={m} /></CardContent></Card>
    </>
  );
}
