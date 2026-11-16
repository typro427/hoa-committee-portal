import { z } from "zod";
import { getAdminContext } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { csvResponse, pdfResponse } from "@/lib/pdf";
import { audit } from "@/lib/audit";
import { buildReport, defaultRange, REPORT_TYPES, reportToCsv, reportToPdf, type ReportType } from "@/server/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  const admin = await getAdminContext();
  if (!admin) return new Response("Administrator sign-in required.", { status: 401 });
  const { type } = await params;
  if (!(type in REPORT_TYPES)) return new Response("Unknown report", { status: 404 });
  const org = await getOrganization();
  const sp = new URL(req.url).searchParams;
  const def = defaultRange(org.timezone);
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const p = {
    committeeId: z.string().uuid().optional().catch(undefined).parse(sp.get("committee") || undefined),
    from: date.catch(def.from).parse(sp.get("from") ?? def.from),
    to: date.catch(def.to).parse(sp.get("to") ?? def.to),
  };
  const report = await buildReport(type as ReportType, p);
  const format = sp.get("format") === "pdf" ? "pdf" : "csv";
  await audit(admin, { action: "report.exported", entityType: "report", entityId: type, committeeId: p.committeeId ?? null, details: { format, ...p } });
  const name = `${report.title} ${p.from} to ${p.to}`;
  return format === "pdf" ? pdfResponse(await reportToPdf(report), `${name}.pdf`) : csvResponse(reportToCsv(report), `${name}.csv`);
}
