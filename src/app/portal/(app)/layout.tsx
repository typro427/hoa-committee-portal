import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav";
import { requireMember } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { logoutMember } from "@/server/auth-actions";
import { ROLE_LABELS } from "@/lib/format";
import { memberHandlesArb } from "@/server/arb";

export const dynamic = "force-dynamic";

const items: NavItem[] = [
  { href: "/portal", label: "Overview", icon: "LayoutDashboard" },
  { href: "/portal/meetings", label: "Meetings", icon: "CalendarDays" },
  { href: "/portal/minutes", label: "Meeting Minutes", icon: "FileText" },
  { href: "/portal/documents", label: "Documents", icon: "FolderOpen" },
  { href: "/portal/tasks", label: "My Tasks", icon: "ListChecks" },
  { href: "/portal/members", label: "Committee Members", icon: "Users" },
  { href: "/portal/profile", label: "My Profile", icon: "UserRound" },
];

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireMember();
  const org = await getOrganization();
  const nav = (await memberHandlesArb(actor.committeeId))
    ? [...items.slice(0, 4), { href: "/portal/arb", label: "ARB Requests", icon: "ClipboardCheck" } as NavItem, ...items.slice(4)]
    : items;
  return (
    <AppShell
      root="/portal"
      items={nav}
      orgName={org.name}
      logoUrl={org.logoUrl}
      title={actor.committeeName}
      subtitle={ROLE_LABELS[actor.role]}
      userName={actor.name}
      logoutAction={logoutMember}
      extraFooter={
        actor.memberships.length > 1 ? (
          <Link href="/portal/select" className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            <ArrowLeftRight className="size-5" /> Switch committee
          </Link>
        ) : undefined
      }
    >
      {children}
    </AppShell>
  );
}
