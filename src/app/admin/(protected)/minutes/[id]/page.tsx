import { requireAdmin } from "@/lib/session";
import { MinutesDetailView } from "@/views/minutes-detail";

export const metadata = { title: "Meeting Minutes" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const actor = await requireAdmin();
  return <MinutesDetailView actor={actor} id={(await params).id} editRequested={(await searchParams).edit === "1"} />;
}
