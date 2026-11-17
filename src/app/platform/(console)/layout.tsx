import Link from "next/link";
import { LogOut } from "lucide-react";
import { requirePlatform } from "@/lib/session";
import { platformName } from "@/lib/tenant";
import { platformLogout } from "@/server/platform-actions";
import { platformSiteOnly } from "../guard";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Owner Console", template: "%s · Owner Console" } };

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  await platformSiteOnly();
  const owner = await requirePlatform();
  return (
    <div className="min-h-screen">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Link href="/platform" className="leading-tight">
            <p className="text-xs uppercase tracking-wide text-slate-400">{platformName()}</p>
            <p className="font-semibold">Owner Console</p>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline">{owner.name}</span>
            <form action={platformLogout}><button className="flex items-center gap-1.5 rounded-lg px-3 py-2 hover:bg-white/10"><LogOut className="size-4" /> Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-16">{children}</main>
    </div>
  );
}
