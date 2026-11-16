"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Menu, X, LayoutDashboard, CalendarDays, FileText, FolderOpen, ListChecks, Users,
  Building2, KeyRound, BarChart3, ScrollText, Settings, UserRound, ClipboardCheck,
} from "lucide-react";

const Icons = {
  LayoutDashboard, CalendarDays, FileText, FolderOpen, ListChecks, Users,
  Building2, KeyRound, BarChart3, ScrollText, Settings, UserRound, ClipboardCheck,
};
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: keyof typeof Icons };

function isActive(path: string, href: string, root: string) {
  return href === root ? path === root : path === href || path.startsWith(href + "/");
}

export function SideNav({ items, root }: { items: NavItem[]; root: string }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((i) => {
        const Icon = Icons[i.icon];
        const active = isActive(path, i.href, root);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-navy-800 text-white" : "text-slate-700 hover:bg-slate-100",
            )}
          >
            <Icon className="size-5" />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ items, root, footer }: { items: NavItem[]; root: string; footer?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-white hover:bg-white/10"
        aria-label="Open menu"
      >
        <Menu className="size-6" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col gap-4 overflow-y-auto bg-white p-4 shadow-xl">
            <div className="flex justify-end">
              <button onClick={() => setOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close menu">
                <X className="size-6" />
              </button>
            </div>
            <SideNav items={items} root={root} />
            {footer && <div className="mt-auto border-t pt-4">{footer}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
