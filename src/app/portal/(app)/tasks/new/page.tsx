import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { TaskForm } from "@/views/tasks";

export const metadata = { title: "New Task" };

export default async function Page() {
  const actor = await requireMember();
  if (!can.manageTasks(actor, actor.committeeId)) notFound();
  return (
    <>
      <PageHeader back={{ href: "/portal/tasks", label: "Tasks" }} title="New Task" description={actor.committeeName} />
      <Card><CardContent className="pt-5 sm:pt-5"><TaskForm actor={actor} /></CardContent></Card>
    </>
  );
}
