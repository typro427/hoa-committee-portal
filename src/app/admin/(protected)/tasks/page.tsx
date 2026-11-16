import { requireAdmin } from "@/lib/session";
import { TasksListView } from "@/views/tasks";

export const metadata = { title: "Tasks" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireAdmin();
  return <TasksListView actor={actor} sp={await searchParams} />;
}
