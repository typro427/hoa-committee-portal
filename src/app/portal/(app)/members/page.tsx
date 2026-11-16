import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { PageHeader, RoleBadge } from "@/components/common";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Committee Members" };

export default async function MembersPage() {
  const actor = await requireMember();
  // Members only see the directory of their own (active) committee. PINs are never selected.
  const rows = await db.committeeMembership.findMany({
    where: { committeeId: actor.committeeId, isActive: true },
    select: { id: true, role: true, position: true, member: { select: { firstName: true, lastName: true, status: true } } },
    orderBy: [{ role: "asc" }, { member: { lastName: "asc" } }],
  });
  const order = { CHAIR: 0, SECRETARY: 1, MEMBER: 2 };
  rows.sort((a, b) => order[a.role] - order[b.role]);
  return (
    <>
      <PageHeader title="Committee Members" description={`${actor.committeeName} · ${rows.length} members`} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-navy-100 font-semibold text-navy-800">
              {r.member.firstName[0]}{r.member.lastName[0]}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{r.member.firstName} {r.member.lastName}</p>
              <p className="text-sm text-slate-500">{r.position ?? (r.role === "MEMBER" ? "Committee Member" : "")}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <RoleBadge role={r.role} />
              <Badge tone={r.member.status === "ACTIVE" ? "green" : "gray"}>{r.member.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
