import Link from "next/link";
import { redirect } from "next/navigation";
import { PinLogin } from "@/components/pin-login";
import { BrandMark } from "@/components/brand";
import { loginWithPin } from "@/server/auth-actions";
import { getMemberContext } from "@/lib/session";
import { getOrganizationSafe } from "@/lib/org";
import { arbCommittee } from "@/server/arb";

export const metadata = { title: "Sign In" };

export default async function LoginPage() {
  const ctx = await getMemberContext();
  if (ctx) redirect(ctx.active ? "/portal" : "/portal/select");
  const org = await getOrganizationSafe();
  const arb = await arbCommittee().catch(() => null);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandMark logoUrl={org?.logoUrl} className="mb-3 size-14" />
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{org?.name ?? "HOA"}</p>
          <h1 className="text-2xl font-bold text-navy-900">Committee Portal</h1>
          <p className="mt-1 text-sm text-slate-500">{org?.tagline ?? "Organized Committees. Better Decisions."}</p>
        </div>
        <p className="mb-5 text-center text-base text-slate-700">Enter your 4-digit committee PIN</p>
        <PinLogin action={loginWithPin} />
      </div>
      {arb && (
        <Link href="/arb" className="mt-4 w-full max-w-md rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-navy-800 shadow-sm hover:border-navy-300">
          Homeowner? Submit or track an architectural (ARB) request →
        </Link>
      )}
      <p className="mt-6 text-center text-sm text-slate-500">
        Forgot your PIN? Contact your HOA administrator.
        <br />
        <Link href="/admin/login" className="mt-2 inline-block text-slate-400 hover:text-navy-700">Administrator sign-in</Link>
      </p>
    </main>
  );
}
