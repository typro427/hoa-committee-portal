import { requireMember } from "@/lib/session";
import { TasksListView } from "@/views/tasks";

export const metadata = { title: "My Tasks" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireMember();
  return <TasksListView actor={actor} sp={await searchParams} />;
}
