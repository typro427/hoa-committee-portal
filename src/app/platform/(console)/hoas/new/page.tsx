import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section } from "@/components/common";
import { Field, Input, Select } from "@/components/ui/form";
import { rootDomain } from "@/lib/tenant";
import { createHoa } from "@/server/platform-actions";

export const metadata = { title: "New HOA" };

export default function NewHoa() {
  const root = rootDomain();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader back={{ href: "/platform", label: "HOAs" }} title="Add an HOA" description="Creates the HOA's private space and its first administrator." />
      <ActionForm action={createHoa} className="flex flex-col gap-5">
        <Section title="HOA">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="HOA name" htmlFor="name"><Input id="name" name="name" required placeholder="Deerfield Resort HOA" /></Field>
            <Field label="Web address" htmlFor="slug" hint={root ? `Members will go to <address>.${root}` : "Used once ROOT_DOMAIN is set."}>
              <div className="flex items-center gap-1"><Input id="slug" name="slug" required pattern="[a-z0-9-]+" placeholder="deerfield" className="lowercase" />{root && <span className="shrink-0 text-sm text-slate-500">.{root}</span>}</div>
            </Field>
            <Field label="Time zone" htmlFor="timezone"><Input id="timezone" name="timezone" defaultValue="America/New_York" required /></Field>
            <Field label="Account" htmlFor="status">
              <Select id="status" name="status" defaultValue="TRIAL"><option value="TRIAL">Free trial</option><option value="ACTIVE">Active (paying or comped)</option></Select>
            </Field>
            <Field label="Trial length (days)" htmlFor="trialDays"><Input id="trialDays" name="trialDays" type="number" min={1} max={365} defaultValue={30} /></Field>
            <label className="flex items-start gap-2 self-end pb-2 text-sm"><input type="checkbox" name="starterCommittees" defaultChecked className="mt-0.5 size-4" /><span>Start with ARB, Safety &amp; Security, and Special Events committees</span></label>
            <Field label="Billing contact name (optional)" htmlFor="contactName"><Input id="contactName" name="contactName" /></Field>
            <Field label="Billing contact email (optional)" htmlFor="contactEmail"><Input id="contactEmail" name="contactEmail" type="email" /></Field>
          </div>
        </Section>
        <Section title="First administrator">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" htmlFor="adminName"><Input id="adminName" name="adminName" required /></Field>
            <Field label="Email" htmlFor="adminEmail"><Input id="adminEmail" name="adminEmail" type="email" required /></Field>
            <Field label="Temporary password" htmlFor="adminPassword" hint="12+ characters. They can change it in Settings."><Input id="adminPassword" name="adminPassword" type="text" minLength={12} required autoComplete="off" /></Field>
          </div>
        </Section>
        <div><SubmitButton size="lg">Create HOA</SubmitButton></div>
      </ActionForm>
    </div>
  );
}
