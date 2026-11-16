import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getMemberContext } from "@/lib/session";
import { selectCommittee, logoutMember } from "@/server/auth-actions";
import { ROLE_LABELS } from "@/lib/format";

export const metadata = { title: "Choose Committee" };

export default async function SelectCommitteePage() {
  const ctx = await getMemberContext();
  if (!ctx) redirect("/login");
  if (ctx.memberships.length === 1 && ctx.active) redirect("/portal");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-navy-900">Welcome, {ctx.member.name.split(" ")[0]}</h1>
        <p className="mb-5 mt-1 text-slate-600">You serve on more than one committee. Which would you like to open?</p>
        <div className="flex flex-col gap-3">
          {ctx.memberships.map((m) => (
            <form key={m.committeeId} action={selectCommittee}>
              <input type="hidden" name="committeeId" value={m.committeeId} />
              <button className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-4 text-left hover:border-navy-300 hover:bg-navy-50">
                <span>
                  <span className="block font-semibold text-navy-900">{m.committeeName}</span>
                  <span className="text-sm text-slate-500">{ROLE_LABELS[m.role]}</span>
                </span>
                <ChevronRight className="size-5 text-slate-400" />
              </button>
            </form>
          ))}
        </div>
        <form action={logoutMember} className="mt-6 text-center">
          <button className="text-sm text-slate-500 hover:text-navy-700">Sign out</button>
        </form>
      </div>
    </main>
  );
}
