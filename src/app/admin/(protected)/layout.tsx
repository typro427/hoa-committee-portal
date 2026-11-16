import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { adminLogout } from "@/server/auth-actions";

export const dynamic = "force-dynamic";

const items: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "LayoutDashboard" },
  { href: "/admin/committees", label: "Committees", icon: "Building2" },
  { href: "/admin/members", label: "Members", icon: "Users" },
  { href: "/admin/pins", label: "PIN Management", icon: "KeyRound" },
  { href: "/admin/meetings", label: "Meetings", icon: "CalendarDays" },
  { href: "/admin/minutes", label: "Meeting Minutes", icon: "FileText" },
  { href: "/admin/documents", label: "Documents", icon: "FolderOpen" },
  { href: "/admin/tasks", label: "Tasks", icon: "ListChecks" },
  { href: "/admin/reports", label: "Reports", icon: "BarChart3" },
  { href: "/admin/audit", label: "Audit Log", icon: "ScrollText" },
  { href: "/admin/settings", label: "Settings", icon: "Settings" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const org = await getOrganization();
  return (
    <AppShell root="/admin" items={items} orgName={org.name} logoUrl={org.logoUrl} title="Administration" userName={admin.name} logoutAction={adminLogout}>
      {children}
    </AppShell>
  );
}
