import { FileDown, Sheet } from "lucide-react";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { PageHeader, Section } from "@/components/common";
import { buttonVariants } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { buildReport, defaultRange, REPORT_TYPES, type ReportType } from "@/server/reports";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ type?: string; committee?: string; from?: string; to?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const org = await getOrganization();
  const committees = await db.committee.findMany({ where: { organizationId: org.id }, orderBy: { name: "asc" } });
  const def = defaultRange(org.timezone);
  const type = (sp.type && sp.type in REPORT_TYPES ? sp.type : "activity") as ReportType;
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const committeeId = committees.some((c) => c.id === sp.committee) ? sp.committee : undefined;
  const p = { committeeId, from: isDate(sp.from) ? sp.from! : def.from, to: isDate(sp.to) ? sp.to! : def.to };
  const report = await buildReport(type, p);
  const qs = new URLSearchParams({ ...(committeeId ? { committee: committeeId } : {}), from: p.from, to: p.to });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" description="Preview reports and export them to PDF or CSV." />
      <form action="/admin/reports" className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field label="Report" htmlFor="type" className="lg:col-span-2">
          <Select id="type" name="type" defaultValue={type}>
            {Object.entries(REPORT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Committee" htmlFor="committee">
          <Select id="committee" name="committee" defaultValue={committeeId ?? ""}>
            <option value="">All committees</option>
            {committees.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="From" htmlFor="from"><Input id="from" name="from" type="date" defaultValue={p.from} /></Field>
        <Field label="To" htmlFor="to"><Input id="to" name="to" type="date" defaultValue={p.to} /></Field>
        <button className={buttonVariants({ className: "lg:col-span-5 sm:col-span-2" })}>Run report</button>
      </form>

      <Section
        title={report.title}
        actions={
          <div className="flex gap-2">
            <a href={`/api/reports/${type}?${qs}&format=pdf`} className={buttonVariants({ variant: "outline", size: "sm" })}><FileDown /> PDF</a>
            <a href={`/api/reports/${type}?${qs}&format=csv`} className={buttonVariants({ variant: "outline", size: "sm" })}><Sheet /> CSV</a>
          </div>
        }
      >
        <p className="mb-4 text-sm text-slate-500">{report.subtitle}</p>
        {report.summary.length > 0 && (
          <dl className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {report.summary.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs font-semibold uppercase text-slate-500">{k}</dt><dd className="font-semibold text-navy-900">{v}</dd></div>
            ))}
          </dl>
        )}
        {report.tables.map((t, i) => (
          <div key={i} className="mb-6">
            {t.heading && <h3 className="mb-2 font-semibold text-navy-900">{t.heading}</h3>}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{t.columns.map((c) => <th key={c.label} className="px-3 py-2 font-semibold">{c.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {t.rows.length === 0 && <tr><td colSpan={t.columns.length} className="px-3 py-4 text-center text-slate-500">No records for this period.</td></tr>}
                  {t.rows.map((r, ri) => <tr key={ri}>{r.map((cell, ci) => <td key={ci} className="whitespace-pre-wrap px-3 py-2 align-top">{cell}</td>)}</tr>)}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}
