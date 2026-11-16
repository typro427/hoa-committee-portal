import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  gray: "bg-slate-100 text-slate-700 ring-slate-200",
  navy: "bg-navy-50 text-navy-800 ring-navy-100",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "gray", className, ...p }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", tones[tone], className)}
      {...p}
    />
  );
}
