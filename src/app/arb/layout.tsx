import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { getOrganizationSafe } from "@/lib/org";

export const dynamic = "force-dynamic";

/** Public pages for residents (no sign-in). */
export default async function ResidentLayout({ children }: { children: React.ReactNode }) {
  const org = await getOrganizationSafe();
  return (
    <div className="min-h-screen">
      <header className="bg-navy-900 text-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
          <BrandMark logoUrl={org?.logoUrl} className="size-9 border border-white/20" />
          <div className="leading-tight">
            <p className="text-xs uppercase tracking-wide text-navy-200">{org?.name ?? "HOA"}</p>
            <p className="font-semibold">Architectural Review</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">{children}</main>
      <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-slate-500">
        <Link href="/login" className="hover:text-navy-700">Committee member sign-in</Link>
      </footer>
    </div>
  );
}
