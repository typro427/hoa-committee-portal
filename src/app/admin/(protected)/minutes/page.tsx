import { requireAdmin } from "@/lib/session";
import { MinutesListView } from "@/views/minutes-list";

export const metadata = { title: "Meeting Minutes" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdmin();
  return <MinutesListView actor={actor} sp={await searchParams} />;
}
