import { requireAdmin } from "@/lib/session";
import { ArbDetailView } from "@/views/arb-views";

export const metadata = { title: "ARB Request" };

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const actor = await requireAdmin();
  const sp = await searchParams;
  return <ArbDetailView actor={actor} id={(await params).id} tab={sp.tab} created={sp.created === "1"} />;
}
