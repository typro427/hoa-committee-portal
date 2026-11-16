import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge, type Tone } from "@/components/ui/badge";
import {
  MEETING_STATUS_LABELS, MINUTES_STATUS_LABELS, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, ROLE_LABELS,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, back }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-navy-700">
            <ChevronLeft className="size-4" /> {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-navy-900 break-words">{title}</h1>
        {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 no-print">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500", className)}>{children}</div>;
}

const meetingTone: Record<string, Tone> = { SCHEDULED: "navy", COMPLETED: "green", CANCELLED: "red", POSTPONED: "amber" };
export function MeetingStatusBadge({ status }: { status: keyof typeof MEETING_STATUS_LABELS }) {
  return <Badge tone={meetingTone[status]}>{MEETING_STATUS_LABELS[status]}</Badge>;
}

const minutesTone: Record<string, Tone> = { DRAFT: "gray", SUBMITTED: "blue", CHANGES_REQUESTED: "amber", APPROVED: "navy", PUBLISHED: "green" };
export function MinutesStatusBadge({ status }: { status: keyof typeof MINUTES_STATUS_LABELS }) {
  return <Badge tone={minutesTone[status]}>{MINUTES_STATUS_LABELS[status]}</Badge>;
}

const taskTone: Record<string, Tone> = { NOT_STARTED: "gray", IN_PROGRESS: "blue", WAITING_ON_INFORMATION: "amber", COMPLETED: "green", CANCELLED: "red" };
export function TaskStatusBadge({ status }: { status: keyof typeof TASK_STATUS_LABELS }) {
  return <Badge tone={taskTone[status]}>{TASK_STATUS_LABELS[status]}</Badge>;
}

const prioTone: Record<string, Tone> = { LOW: "gray", NORMAL: "navy", HIGH: "amber", URGENT: "red" };
export function PriorityBadge({ priority }: { priority: keyof typeof TASK_PRIORITY_LABELS }) {
  return <Badge tone={prioTone[priority]}>{TASK_PRIORITY_LABELS[priority]}</Badge>;
}

export function RoleBadge({ role }: { role: keyof typeof ROLE_LABELS }) {
  return <Badge tone={role === "CHAIR" ? "navy" : role === "SECRETARY" ? "blue" : "gray"}>{ROLE_LABELS[role]}</Badge>;
}

export function StatCard({ label, value, href, icon, tone = "navy" }: { label: string; value: React.ReactNode; href?: string; icon?: React.ReactNode; tone?: "navy" | "amber" | "red" | "green" }) {
  const toneCls = { navy: "text-navy-800 bg-navy-50", amber: "text-amber-700 bg-amber-50", red: "text-red-700 bg-red-50", green: "text-emerald-700 bg-emerald-50" }[tone];
  const inner = (
    <div className="flex h-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-navy-200 sm:p-4">
      {icon && <span className={cn("hidden size-11 shrink-0 items-center justify-center rounded-lg sm:flex [&_svg]:size-5", toneCls)}>{icon}</span>}
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight text-navy-900 sm:text-2xl">{value}</p>
        <p className="text-xs leading-snug text-slate-500 sm:text-sm">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

export function Tabs({ tabs, current }: { tabs: { key: string; label: string; href: string; count?: number }[]; current: string }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 no-print">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium",
            current === t.key ? "bg-navy-800 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("rounded-full px-1.5 text-xs", current === t.key ? "bg-white/20" : "bg-slate-100")}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function ScopeInput({ scope }: { scope: "portal" | "admin" }) {
  return <input type="hidden" name="scope" value={scope} />;
}

export function Section({ title, children, actions, className }: { title: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold text-navy-900">{title}</h2>
        {actions}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
