import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { MeetingForm } from "@/views/meeting-form";

export const metadata = { title: "New Meeting" };

export default async function Page({ searchParams }: { searchParams: Promise<{ committee?: string }> }) {
  await requireAdmin();
  const org = await getOrganization();
  const committees = await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <>
      <PageHeader back={{ href: "/admin/meetings", label: "Meetings" }} title="Schedule a Meeting" />
      <Card><CardContent className="pt-5 sm:pt-5"><MeetingForm scope="admin" committees={committees} defaultCommitteeId={(await searchParams).committee} /></CardContent></Card>
    </>
  );
}
