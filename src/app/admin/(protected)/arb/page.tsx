import { requireAdmin } from "@/lib/session";
import { ArbListView } from "@/views/arb-views";

export const metadata = { title: "ARB Requests" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdmin();
  return <ArbListView actor={actor} sp={await searchParams} />;
}
