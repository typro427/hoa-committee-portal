"use client";

import * as React from "react";
import { createContext, startTransition, useActionState, useContext, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionResult = { ok: boolean; error?: string; message?: string; data?: Record<string, unknown> } | null;
type ActionFn = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

const PendingContext = createContext<boolean | null>(null);

/**
 * Form bound to a server action. Shows validation/permission errors and success messages inline.
 * `confirm` asks before submitting (for destructive actions).
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess,
  showMessages = true,
  render,
}: {
  action: ActionFn;
  children?: React.ReactNode;
  className?: string;
  confirm?: string;
  resetOnSuccess?: boolean;
  showMessages?: boolean;
  render?: (state: ActionResult) => React.ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <PendingContext.Provider value={pending}>
      <form
        ref={ref}
        className={className}
        // Submitting through the action dispatcher (instead of <form action>) keeps what the
        // person typed if the server returns a validation error. React would otherwise clear the form.
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          if (confirm && !window.confirm(confirm)) return;
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const fd = new FormData(e.currentTarget, submitter);
          startTransition(() => dispatch(fd));
        }}
      >
        {children}
        {render?.(state)}
        {showMessages && <FormMessage state={state} />}
      </form>
    </PendingContext.Provider>
  );
}

export function FormMessage({ state }: { state: ActionResult }) {
  if (!state) return null;
  if (state.error)
    return (
      <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
        <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
      </p>
    );
  if (state.message)
    return (
      <p role="status" className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {state.message}
      </p>
    );
  return null;
}

export function SubmitButton({ children, className, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const ctx = useContext(PendingContext);
  const status = useFormStatus();
  const pending = ctx ?? status.pending;
  return (
    <Button type="submit" disabled={pending || props.disabled} className={cn(className)} {...props}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" /> {pendingText ?? "Saving…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
