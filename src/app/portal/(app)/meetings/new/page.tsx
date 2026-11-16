import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingForm } from "@/views/meeting-form";

export const metadata = { title: "New Meeting" };

export default async function Page() {
  const actor = await requireMember();
  if (!can.manageMeetings(actor, actor.committeeId)) notFound();
  return (
    <>
      <PageHeader back={{ href: "/portal/meetings", label: "Meetings" }} title="Schedule a Meeting" description={actor.committeeName} />
      <Card><CardContent className="pt-5 sm:pt-5"><MeetingForm scope="portal" /></CardContent></Card>
    </>
  );
}
