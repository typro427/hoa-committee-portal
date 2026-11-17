import { AppShell } from "@/components/app-shell";
import type { NavItem } from "@/components/nav";
import { requireAdmin } from "@/lib/session";
import { getOrganization, orgAccess, trialDaysLeft } from "@/lib/org";
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
  { href: "/admin/arb", label: "ARB Requests", icon: "ClipboardCheck" },
  { href: "/admin/reports", label: "Reports", icon: "BarChart3" },
  { href: "/admin/audit", label: "Audit Log", icon: "ScrollText" },
  { href: "/admin/settings", label: "Settings", icon: "Settings" },
];

function AccountBanner({ org }: { org: Awaited<ReturnType<typeof getOrganization>> }) {
  const access = orgAccess(org);
  const days = trialDaysLeft(org);
  if (!access.active) {
    return (
      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">{access.reason === "trial_ended" ? "Your free trial has ended." : access.reason === "cancelled" ? "This account is cancelled." : "This account is suspended."}</p>
        <p>Committee members and residents can&apos;t use the portal right now. Your data is safe. Contact us to reactivate.</p>
      </div>
    );
  }
  if (org.status === "PAST_DUE") return <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Your last payment didn&apos;t go through. Please update billing to avoid interruption.</div>;
  if (days !== null) return <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Free trial: {days} day{days === 1 ? "" : "s"} left.</div>;
  return null;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const org = await getOrganization();
  return (
    <AppShell root="/admin" items={items} orgName={org.name} logoUrl={org.logoUrl} title="Administration" userName={admin.name} logoutAction={adminLogout}>
      <AccountBanner org={org} />
      {children}
    </AppShell>
  );
}
