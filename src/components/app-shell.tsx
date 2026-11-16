import Link from "next/link";
import { LogOut } from "lucide-react";
import { MobileNav, SideNav, type NavItem } from "@/components/nav";
import { BrandMark } from "@/components/brand";

export function AppShell({
  root, items, orgName, logoUrl, title, subtitle, userName, logoutAction, extraFooter, children,
}: {
  root: string;
  items: NavItem[];
  orgName: string;
  logoUrl?: string | null;
  title: string;
  subtitle?: string;
  userName: string;
  logoutAction: () => Promise<void>;
  extraFooter?: React.ReactNode;
  children: React.ReactNode;
}) {
  const footer = (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-sm text-slate-500">Signed in as <span className="font-medium text-slate-700">{userName}</span></p>
      {extraFooter}
      <form action={logoutAction}>
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
          <LogOut className="size-5" /> Sign out
        </button>
      </form>
    </div>
  );
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-navy-900 text-white shadow">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
          <Link href={root} className="flex min-w-0 items-center gap-3">
            <BrandMark logoUrl={logoUrl} className="size-9 shrink-0 border border-white/20" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-xs uppercase tracking-wide text-navy-200">{orgName}</p>
              <p className="truncate text-base font-semibold">{title}</p>
            </div>
          </Link>
          <div className="hidden items-center gap-4 lg:flex">
            {subtitle && <span className="text-sm text-navy-200">{subtitle}</span>}
            <span className="text-sm">{userName}</span>
            <form action={logoutAction}>
              <button className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10">
                <LogOut className="size-4" /> Sign out
              </button>
            </form>
          </div>
          <MobileNav items={items} root={root} footer={footer} />
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5 sm:py-6">
        <aside className="hidden w-56 shrink-0 lg:block">
          <div className="sticky top-20">
            <SideNav items={items} root={root} />
            {extraFooter && <div className="mt-4 border-t pt-4">{extraFooter}</div>}
          </div>
        </aside>
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
