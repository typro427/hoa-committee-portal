"use client";

import { useActionState, useRef } from "react";
import { KeyRound, Printer } from "lucide-react";
import { FormMessage, type ActionResult } from "@/components/action-form";
import { Button } from "@/components/ui/button";

type Pins = { name: string; committees?: string; pin: string }[];

/**
 * Form for actions that return newly generated PINs. The PIN is shown exactly once,
 * here, and is never retrievable again — it is only stored as a hash.
 */
export function PinResultForm({
  action, children, className, confirm, orgName, loginUrl,
}: {
  action: (p: ActionResult, fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  orgName: string;
  loginUrl: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const printRef = useRef<HTMLDivElement>(null);
  const data = state?.data as { pin?: string; name?: string; pins?: Pins; inactive?: boolean } | undefined;
  const pins: Pins = data?.pins ?? (data?.pin ? [{ name: data.name ?? "", pin: data.pin }] : []);

  const print = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w || !printRef.current) return;
    w.document.write(`<!doctype html><html><head><title>Committee Portal PINs</title><style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;margin:24px;color:#152340}
      .slip{border:2px dashed #8faacf;border-radius:12px;padding:18px 22px;margin:0 0 18px;page-break-inside:avoid}
      .org{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#5f6b7a}
      .name{font-size:20px;font-weight:700;margin:4px 0}
      .pin{font-size:34px;font-weight:800;letter-spacing:.25em;font-family:ui-monospace,Menlo,monospace;margin:8px 0}
      .small{font-size:13px;color:#3d4756}
    </style></head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  return (
    <div className={className}>
      <form action={formAction} onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}>
        {children}
      </form>
      <FormMessage state={state} />
      {pins.length > 0 && (
        <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="flex items-center gap-2 font-semibold text-amber-900"><KeyRound className="size-5" /> Record or print {pins.length === 1 ? "this PIN" : "these PINs"} now</p>
          <p className="mb-3 text-sm text-amber-800">For security, PINs are shown only once and cannot be viewed again. If one is lost, generate a new PIN.</p>
          {data?.inactive && <p className="mb-3 text-sm font-semibold text-red-700">Note: this member is inactive and cannot sign in until reactivated.</p>}
          <ul className="flex flex-col gap-2">
            {pins.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3">
                <span><span className="font-semibold">{p.name}</span>{p.committees ? <span className="text-sm text-slate-500"> · {p.committees}</span> : null}</span>
                <span className="font-mono text-2xl font-bold tracking-[0.2em] text-navy-900">{p.pin}</span>
              </li>
            ))}
          </ul>
          <Button type="button" variant="outline" className="mt-3" onClick={print}><Printer /> Print PIN slip{pins.length > 1 ? "s" : ""}</Button>
          <div ref={printRef} hidden>
            {pins.map((p, i) => (
              <div key={i} className="slip">
                <div className="org">{orgName} · Committee Portal</div>
                <div className="name">{p.name}</div>
                {p.committees && <div className="small">{p.committees}</div>}
                <div className="pin">{p.pin}</div>
                <div className="small">Sign in at <b>{loginUrl}</b> and enter this PIN. Keep it private — it identifies you personally. Contact the HOA administrator if you lose it.</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
