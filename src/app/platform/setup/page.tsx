import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { db } from "@/lib/db";
import { setupFirstOwner } from "@/server/platform-actions";
import { platformSiteOnly } from "../guard";

export const metadata = { title: "Owner Setup" };
export const dynamic = "force-dynamic";

export default async function PlatformSetup() {
  await platformSiteOnly();
  if ((await db.platformUser.count()) > 0) redirect("/platform/login");
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Create the owner account</h1>
        <p className="mb-5 mt-1 text-sm text-slate-600">This account manages every HOA. Enter the <code>SETUP_TOKEN</code> from your Render environment. This page stops working once an owner exists.</p>
        {!process.env.SETUP_TOKEN ? (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Setup is disabled. Set <code>SETUP_TOKEN</code>, or run <code>npm run owner:create</code>.</p>
        ) : (
          <ActionForm action={setupFirstOwner} className="flex flex-col gap-4">
            <Field label="Setup token" htmlFor="token"><Input id="token" name="token" type="password" required /></Field>
            <Field label="Your name" htmlFor="name"><Input id="name" name="name" required /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
            <Field label="Password" htmlFor="password" hint="At least 14 characters."><Input id="password" name="password" type="password" minLength={14} autoComplete="new-password" required /></Field>
            <Field label="Confirm password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" autoComplete="new-password" required /></Field>
            <SubmitButton>Create Owner Account</SubmitButton>
          </ActionForm>
        )}
      </div>
    </main>
  );
}
