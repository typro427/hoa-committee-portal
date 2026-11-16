import { requireAdmin } from "@/lib/session";
import { MinutesDetailView } from "@/views/minutes-detail";

export const metadata = { title: "Meeting Minutes" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; imported?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  return <MinutesDetailView actor={actor} id={(await params).id} editRequested={sp.edit === "1"} imported={sp.imported === "1"} />;
}
