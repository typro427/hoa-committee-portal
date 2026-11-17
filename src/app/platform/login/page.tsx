import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui/form";
import { db } from "@/lib/db";
import { getPlatformContext } from "@/lib/session";
import { platformName } from "@/lib/tenant";
import { platformLogin } from "@/server/platform-actions";
import { platformSiteOnly } from "../guard";

export const metadata = { title: "Owner Sign In" };
export const dynamic = "force-dynamic";

export default async function PlatformLogin() {
  await platformSiteOnly();
  if (await getPlatformContext()) redirect("/platform");
  const none = (await db.platformUser.count()) === 0;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-500">{platformName()}</p>
        <h1 className="mb-5 text-lg font-bold text-slate-900">Owner Console</h1>
        {none && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No owner account yet. <Link className="font-semibold underline" href="/platform/setup">Run first-time setup</Link>.</p>}
        <ActionForm action={platformLogin} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="username" required /></Field>
          <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
          <SubmitButton pendingText="Signing in…">Sign In</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
