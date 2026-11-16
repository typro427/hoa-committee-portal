"use client";

import { useActionState, useState } from "react";
import { Delete, Loader2, LockKeyhole } from "lucide-react";
import type { ActionResult } from "@/components/action-form";
import { FormMessage } from "@/components/action-form";
import { cn } from "@/lib/utils";

const LEN = 8;

export function PinLogin({ action }: { action: (p: ActionResult, fd: FormData) => Promise<ActionResult> }) {
  const [pin, setPin] = useState("");
  const [state, formAction, pending] = useActionState(async (prev: ActionResult, fd: FormData) => {
    const r = await action(prev, fd);
    if (r && !r.ok) setPin("");
    return r;
  }, null);

  const press = (d: string) => setPin((p) => (p.length < LEN ? p + d : p));
  const back = () => setPin((p) => p.slice(0, -1));

  return (
    <form action={formAction} className="w-full">
      <label htmlFor="pin" className="sr-only">Your PIN</label>
      <input
        id="pin"
        name="pin"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, LEN))}
        inputMode="numeric"
        autoComplete="off"
        pattern="\d*"
        maxLength={LEN}
        autoFocus
        aria-describedby="pin-help"
        className="sr-only"
      />
      <div
        className="mb-6 flex justify-center gap-2 sm:gap-3"
        onClick={() => document.getElementById("pin")?.focus()}
        aria-hidden
      >
        {Array.from({ length: LEN }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-colors",
              i < pin.length ? "border-navy-800 bg-navy-800" : "border-slate-300 bg-white",
            )}
          />
        ))}
      </div>
      <p id="pin-help" className="sr-only">Enter your 8-digit PIN using the keypad or your keyboard.</p>

      <div className="mx-auto grid max-w-xs grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} onClick={() => press(d)}>{d}</Key>
        ))}
        <Key onClick={() => setPin("")} aria-label="Clear" className="text-sm font-medium text-slate-500">Clear</Key>
        <Key onClick={() => press("0")}>0</Key>
        <Key onClick={back} aria-label="Delete last digit"><Delete className="size-6" /></Key>
      </div>

      <button
        type="submit"
        disabled={pin.length !== LEN || pending}
        className="mx-auto mt-6 flex h-14 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-navy-800 text-lg font-semibold text-white transition hover:bg-navy-700 disabled:opacity-40"
      >
        {pending ? <Loader2 className="size-5 animate-spin" /> : <LockKeyhole className="size-5" />}
        {pending ? "Checking…" : "Sign In"}
      </button>
      <div className="mx-auto max-w-xs">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function Key({ className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-16 items-center justify-center rounded-2xl border border-slate-200 bg-white text-2xl font-semibold text-navy-900 shadow-sm transition active:scale-95 active:bg-navy-50 hover:bg-slate-50",
        className,
      )}
      {...p}
    />
  );
}
