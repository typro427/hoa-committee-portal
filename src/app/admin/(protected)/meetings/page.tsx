import { requireAdmin } from "@/lib/session";
import { MeetingsListView } from "@/views/meetings-list";

export const metadata = { title: "Meetings" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdmin();
  return <MeetingsListView actor={actor} sp={await searchParams} />;
}
