import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { BrandMark } from "@/components/brand";
import { adminLogin } from "@/server/auth-actions";
import { getAdminContext } from "@/lib/session";
import { db } from "@/lib/db";
import { getOrganization } from "@/lib/org";

export const metadata = { title: "Administrator Sign In" };

export default async function AdminLoginPage() {
  if (await getAdminContext()) redirect("/admin");
  const org = await getOrganization();
  const noAdmins = (await db.adminUser.count({ where: { organizationId: org.id } })) === 0;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <BrandMark className="size-10" />
          <div>
            <h1 className="text-lg font-bold text-navy-900">Administrator</h1>
            <p className="text-sm text-slate-500">{org.name}</p>
          </div>
        </div>
        {noAdmins && (
          <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            No administrator exists yet. <Link className="font-semibold underline" href="/admin/setup">Run first-time setup</Link>.
          </p>
        )}
        <ActionForm action={adminLogin} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="username" required />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
          <SubmitButton pendingText="Signing in…">Sign In</SubmitButton>
        </ActionForm>
        <Link href="/login" className="mt-5 block text-center text-sm text-slate-500 hover:text-navy-700">← Committee member sign-in</Link>
      </div>
    </main>
  );
}
