import { requireAdmin } from "@/lib/session";
import { MeetingDetailView } from "@/views/meeting-detail";

export const metadata = { title: "Meeting" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  return <MeetingDetailView actor={actor} id={(await params).id} />;
}
