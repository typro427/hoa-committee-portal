import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileText, FolderOpen, KeyRound, ListChecks, ShieldCheck, Smartphone, Video } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/form";
import { platformName } from "@/lib/tenant";
import { findHoa } from "@/server/platform-actions";

const FEATURES = [
  { icon: KeyRound, title: "Simple PIN sign-in", body: "Each committee member gets a personal 4-digit PIN. No usernames, passwords, or app accounts to manage." },
  { icon: CalendarDays, title: "Meetings & agendas", body: "Schedule meetings, build agendas from a standard template, and print them as PDFs." },
  { icon: FileText, title: "Minutes with approval", body: "Secretaries draft, chairs approve and publish. Every change to published minutes is recorded." },
  { icon: Video, title: "Import from Zoom", body: "Turn the Zoom AI meeting summary into draft minutes and assigned action items in a minute." },
  { icon: ListChecks, title: "Tasks & action items", body: "Assign tasks to members, track due dates, and carry open items into the next meeting." },
  { icon: FolderOpen, title: "Private document library", body: "Each committee keeps its own folders of documents, quotes, reports, and policies." },
  { icon: ClipboardCheck, title: "Architectural requests", body: "Homeowners submit ARB requests with plans online and follow progress through approval and permit." },
  { icon: ShieldCheck, title: "Private & accountable", body: "Every committee's information is walled off, and every important change goes in an audit log." },
  { icon: Smartphone, title: "Made for phones", body: "Large buttons and simple screens, built for volunteers who mostly use their phones." },
];

export function Landing() {
  const name = platformName();
  const sales = process.env.SALES_EMAIL;
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2 font-bold text-navy-900"><span className="flex size-9 items-center justify-center rounded-lg bg-navy-800 text-white"><ShieldCheck className="size-5" /></span>{name}</span>
        {sales && <a href={`mailto:${sales}?subject=${encodeURIComponent(`${name} for our HOA`)}`} className="text-sm font-semibold text-navy-700 hover:underline">Contact sales</a>}
      </header>
      <section className="bg-navy-900 text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-2 md:items-center">
          <div>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">Organized committees. Better decisions.</h1>
            <p className="mt-4 text-lg text-navy-100">A private online workspace for your HOA&apos;s committees: meetings, minutes, documents, tasks, and architectural requests, in one place that works on any phone.</p>
          </div>
          <div className="rounded-2xl bg-white p-5 text-slate-900 shadow-xl">
            <h2 className="font-semibold text-navy-900">Already using {name}?</h2>
            <p className="mb-3 text-sm text-slate-600">Find your HOA to sign in.</p>
            <ActionForm action={findHoa} className="flex flex-col gap-2 sm:flex-row">
              <Input name="q" required placeholder="Your HOA's name or web address" aria-label="HOA name or address" />
              <SubmitButton className="shrink-0">Go</SubmitButton>
            </ActionForm>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-navy-900">Everything your committees need</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 p-5">
              <f.icon className="size-6 text-navy-700" />
              <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-slate-500">
          <span>© {new Date().getFullYear()} {name}</span>
          <Link href="/platform/login" className="hover:text-navy-700">Owner sign-in</Link>
        </div>
      </footer>
    </div>
  );
}
