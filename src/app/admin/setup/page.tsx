import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { setupFirstAdmin } from "@/server/auth-actions";
import { db } from "@/lib/db";

export const metadata = { title: "First-time Setup" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if ((await db.adminUser.count()) > 0) redirect("/admin/login");
  const enabled = !!process.env.SETUP_TOKEN;
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-navy-900">Create the first administrator</h1>
        <p className="mb-5 mt-1 text-sm text-slate-600">
          This page only works until the first administrator is created. Enter the <code>SETUP_TOKEN</code> value from your
          environment settings.
        </p>
        {!enabled ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            Setup is disabled. Set a <code>SETUP_TOKEN</code> environment variable (or run <code>npm run admin:create</code>).
          </p>
        ) : (
          <ActionForm action={setupFirstAdmin} className="flex flex-col gap-4">
            <Field label="Setup token" htmlFor="token"><Input id="token" name="token" type="password" required /></Field>
            <Field label="Your name" htmlFor="name"><Input id="name" name="name" required /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
            <Field label="Password" htmlFor="password" hint="At least 12 characters.">
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} required />
            </Field>
            <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton>Create Administrator</SubmitButton>
          </ActionForm>
        )}
      </div>
    </main>
  );
}
