import Link from "next/link";
import { LogOut } from "lucide-react";
import { db } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { PageHeader, RoleBadge, Section } from "@/components/common";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { logoutMember } from "@/server/auth-actions";

export const metadata = { title: "My Profile" };

export default async function ProfilePage() {
  const actor = await requireMember();
  const org = await getOrganization();
  const me = await db.member.findUniqueOrThrow({
    where: { id: actor.memberId },
    select: { firstName: true, lastName: true, email: true, phone: true, lastLoginAt: true },
  });
  return (
    <>
      <PageHeader title="My Profile" />
      <div className="flex flex-col gap-5">
        <Section title="Contact information">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="font-semibold text-slate-500">Name</dt><dd>{me.firstName} {me.lastName}</dd></div>
            <div><dt className="font-semibold text-slate-500">Email</dt><dd>{me.email ?? "—"}</dd></div>
            <div><dt className="font-semibold text-slate-500">Phone</dt><dd>{me.phone ?? "—"}</dd></div>
            <div><dt className="font-semibold text-slate-500">Last sign-in</dt><dd>{formatDateTime(me.lastLoginAt, org.timezone)}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-slate-500">To update your information or get a new PIN, contact your HOA administrator.</p>
        </Section>
        <Section title="My committees">
          <ul className="flex flex-col gap-2">
            {actor.memberships.map((m) => (
              <li key={m.committeeId} className="flex items-center justify-between rounded-lg border p-3">
                <span className="font-medium">{m.committeeName}{m.committeeId === actor.committeeId && <span className="ml-2 text-xs text-slate-500">(current)</span>}</span>
                <RoleBadge role={m.role} />
              </li>
            ))}
          </ul>
          {actor.memberships.length > 1 && <Link href="/portal/select" className={buttonVariants({ variant: "outline", className: "mt-3" })}>Switch committee</Link>}
        </Section>
        <form action={logoutMember}><Button variant="outline" size="lg" className="w-full sm:w-auto"><LogOut /> Sign out</Button></form>
      </div>
    </>
  );
}
