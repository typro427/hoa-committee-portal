import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { TaskForm } from "@/views/tasks";

export const metadata = { title: "New Task" };

export default async function Page({ searchParams }: { searchParams: Promise<{ committee?: string }> }) {
  const actor = await requireAdmin();
  const org = await getOrganization();
  const committees = await db.committee.findMany({ where: { organizationId: org.id, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const wanted = (await searchParams).committee;
  const committee = committees.find((c) => c.id === wanted);
  return (
    <>
      <PageHeader back={{ href: "/admin/tasks", label: "Tasks" }} title="New Task" />
      <Card>
        <CardContent className="pt-5 sm:pt-5">
          {committee ? (
            <TaskForm actor={actor} committees={committees} defaultCommitteeId={committee.id} />
          ) : (
            <form action="/admin/tasks/new" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Which committee is this task for?" htmlFor="committee" className="flex-1">
                <Select id="committee" name="committee" required defaultValue="">
                  <option value="">Choose a committee…</option>
                  {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <button className={buttonVariants()}>Continue</button>
            </form>
          )}
        </CardContent>
      </Card>
    </>
  );
}
