import { FileUp } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Options, Select, Textarea } from "@/components/ui/form";
import { ACCEPT_ATTR } from "@/lib/storage";
import { ARB_DOC_TYPES, ARB_PROJECT_LABELS, UTILITY_LABELS } from "@/lib/arb";
import type { ActionResult } from "@/lib/action";

/** The architectural request form, used on the public resident page and by ARB members entering a request. */
export function ArbRequestForm({ action, scope, staff = false }: { action: (p: ActionResult, fd: FormData) => Promise<ActionResult>; scope?: "portal" | "admin"; staff?: boolean }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-6">
      {scope && <input type="hidden" name="scope" value={scope} />}
      {/* Honeypot: hidden from people, often filled by spam bots. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>

      <Group n={1} title={staff ? "Homeowner" : "About you"}>
        <Field label="Full name" htmlFor="applicantName"><Input id="applicantName" name="applicantName" required autoComplete="name" maxLength={150} /></Field>
        <Field label="Email (optional)" htmlFor="applicantEmail" hint="So the board can contact you."><Input id="applicantEmail" name="applicantEmail" type="email" autoComplete="email" /></Field>
        <Field label="Phone (optional)" htmlFor="applicantPhone"><Input id="applicantPhone" name="applicantPhone" type="tel" autoComplete="tel" /></Field>
        <Field label="Property address" htmlFor="propertyAddress" className="sm:col-span-2"><Input id="propertyAddress" name="propertyAddress" required autoComplete="street-address" maxLength={300} /></Field>
        <Field label="Lot number (optional)" htmlFor="lotNumber"><Input id="lotNumber" name="lotNumber" maxLength={40} /></Field>
      </Group>

      <Group n={2} title="The project">
        <Field label="Type of project" htmlFor="projectType">
          <Select id="projectType" name="projectType" required defaultValue=""><Options labels={ARB_PROJECT_LABELS} empty="Choose…" /></Select>
        </Field>
        <Field label="Contractor (optional)" htmlFor="contractorName"><Input id="contractorName" name="contractorName" maxLength={200} /></Field>
        <Field label="Describe the project" htmlFor="description" className="sm:col-span-2" hint="What you're building or changing, size, materials and colors.">
          <Textarea id="description" name="description" rows={5} required minLength={10} maxLength={10000} />
        </Field>
        <Field label="Estimated start (optional)" htmlFor="estimatedStart"><Input id="estimatedStart" name="estimatedStart" type="date" /></Field>
        <Field label="Estimated completion (optional)" htmlFor="estimatedFinish"><Input id="estimatedFinish" name="estimatedFinish" type="date" /></Field>
      </Group>

      <Group n={3} title="Utilities" description="Are the utility lines at the project location overhead or buried?">
        {(["waterLine", "gasLine", "electricLine"] as const).map((k) => (
          <Field key={k} label={k === "waterLine" ? "Water" : k === "gasLine" ? "Gas" : "Electric"} htmlFor={k}>
            <Select id={k} name={k} defaultValue="UNKNOWN"><Options labels={UTILITY_LABELS} /></Select>
          </Field>
        ))}
        <Field label="Utility notes (optional)" htmlFor="utilityNotes" className="sm:col-span-2"><Textarea id="utilityNotes" name="utilityNotes" rows={2} placeholder="e.g. Buried gas line runs along the east side, 3 ft from the fence" /></Field>
      </Group>

      <Group n={4} title="Supporting documents" description={staff ? "Upload what the homeowner provided. More can be added later." : "Upload what you have now. You can add more later from your tracking page. The building permit is uploaded after the project is complete."}>
        {(["platPlan", "elevations", "utilities", "other"] as const).map((name) => {
          const type = { platPlan: "PLAT_PLAN", elevations: "ELEVATIONS", utilities: "UTILITY_LOCATIONS", other: "OTHER" }[name] as keyof typeof ARB_DOC_TYPES;
          return (
            <div key={name} className="sm:col-span-2 rounded-lg border border-dashed border-slate-300 p-3">
              <label htmlFor={`f-${name}`} className="flex items-center gap-2 font-medium text-slate-800"><FileUp className="size-4 text-navy-600" /> {ARB_DOC_TYPES[type].label}{type !== "OTHER" && <span className="text-xs font-normal text-slate-500">(expected)</span>}</label>
              <p className="mb-2 text-xs text-slate-500">{ARB_DOC_TYPES[type].help}</p>
              <input id={`f-${name}`} name={name} type="file" multiple accept={ACCEPT_ATTR} className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:font-semibold file:text-navy-800" />
            </div>
          );
        })}
        <p className="text-xs text-slate-500 sm:col-span-2">PDF, Word, Excel, or photos (JPG, PNG, HEIC). Up to 25 MB per file.</p>
      </Group>

      <div className="flex flex-col gap-2">
        <SubmitButton size="lg" className="w-full sm:w-auto" pendingText="Submitting…">{staff ? "Create Request" : "Submit Request"}</SubmitButton>
        {!staff && <p className="text-xs text-slate-500">After you submit, you&apos;ll get a private link to check your request&apos;s progress and upload more documents. Save it.</p>}
      </div>
    </ActionForm>
  );
}

function Group({ n, title, description, children }: { n: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <legend className="sr-only">{title}</legend>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy-800 text-sm font-bold text-white">{n}</span>
        <div>
          <h2 className="font-semibold text-navy-900">{title}</h2>
          {description && <p className="text-sm text-slate-600">{description}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
