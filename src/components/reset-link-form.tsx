"use client";
import { useActionState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { FormMessage, type ActionResult } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { CopyLink } from "@/components/copy-link";

/** Creates a new private resident link and shows it once so an ARB member can send it to the homeowner. */
export function ResetLinkForm({ action, scope, requestId }: { action: (p: ActionResult, fd: FormData) => Promise<ActionResult>; scope: string; requestId: string }) {
  const [state, dispatch, pending] = useActionState(action, null);
  const link = (state?.data as { link?: string } | undefined)?.link;
  return (
    <div className="flex flex-col gap-2">
      <form action={dispatch} onSubmit={(e) => { if (!window.confirm("Create a new resident link? The homeowner's current link will stop working.")) e.preventDefault(); }}>
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="requestId" value={requestId} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>{pending ? <Loader2 className="animate-spin" /> : <Link2 />} Create resident link</Button>
      </form>
      <FormMessage state={state} />
      {link && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="mb-2 text-amber-900">Send this link to the homeowner (text or email). It&apos;s shown only now.</p>
          <CopyLink url={link} />
        </div>
      )}
    </div>
  );
}
