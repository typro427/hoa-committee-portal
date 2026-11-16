import { requireAdmin } from "@/lib/session";
import { TaskDetailView } from "@/views/tasks";

export const metadata = { title: "Task" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin();
  return <TaskDetailView actor={actor} id={(await params).id} />;
}
