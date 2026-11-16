import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { can } from "@/lib/permissions";
import { loadMeeting } from "@/server/loaders";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingForm } from "@/views/meeting-form";

export const metadata = { title: "Edit Meeting" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireMember();
  const m = await loadMeeting(actor, (await params).id);
  if (!can.manageMeetings(actor, m.committeeId)) notFound();
  return (
    <>
      <PageHeader back={{ href: `/portal/meetings/${m.id}`, label: "Back to meeting" }} title="Edit Meeting" />
      <Card><CardContent className="pt-5 sm:pt-5"><MeetingForm scope="portal" meeting={m} /></CardContent></Card>
    </>
  );
}
