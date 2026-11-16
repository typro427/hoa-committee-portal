import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { getOrganization } from "@/lib/org";
import { storageHealth } from "@/lib/storage";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/form";
import { formatDateTime } from "@/lib/format";
import { changeOwnPassword, createAdminUser, setAdminStatus, updateSettings } from "@/server/admin-actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const me = await requireAdmin();
  const org = await getOrganization();
  const admins = await db.adminUser.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, status: true, lastLoginAt: true } });
  const storage = await storageHealth();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" />
      <Section title="Organization">
        <ActionForm action={updateSettings} className="grid gap-4 sm:grid-cols-2">
          <Field label="HOA / organization name" htmlFor="name"><Input id="name" name="name" defaultValue={org.name} required /></Field>
          <Field label="Tagline" htmlFor="tagline"><Input id="tagline" name="tagline" defaultValue={org.tagline ?? ""} /></Field>
          <Field label="Logo URL" htmlFor="logoUrl" hint="An https:// link to a square PNG or JPG logo." className="sm:col-span-2"><Input id="logoUrl" name="logoUrl" type="url" defaultValue={org.logoUrl ?? ""} placeholder="https://…" /></Field>
          <Field label="Time zone" htmlFor="timezone" hint="IANA name, e.g. America/New_York"><Input id="timezone" name="timezone" defaultValue={org.timezone} required /></Field>
          <Field label="Sign out after inactivity (minutes)" htmlFor="sessionTimeoutMinutes"><Input id="sessionTimeoutMinutes" name="sessionTimeoutMinutes" type="number" min={5} max={1440} defaultValue={org.sessionTimeoutMinutes} required /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save Settings</SubmitButton></div>
        </ActionForm>
      </Section>

      <Section title="Administrators">
        <ul className="mb-4 divide-y rounded-lg border">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div>
                <p className="font-semibold">{a.name} {a.id === me.adminId && <span className="text-slate-500">(you)</span>}</p>
                <p className="text-slate-500">{a.email} · Last sign-in {formatDateTime(a.lastLoginAt, org.timezone)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={a.status === "ACTIVE" ? "green" : "gray"}>{a.status === "ACTIVE" ? "Active" : "Disabled"}</Badge>
                {a.id !== me.adminId && (
                  <ActionForm action={setAdminStatus} confirm={a.status === "ACTIVE" ? `Disable ${a.email}?` : undefined}>
                    <input type="hidden" name="adminId" value={a.id} />
                    <input type="hidden" name="status" value={a.status === "ACTIVE" ? "DISABLED" : "ACTIVE"} />
                    <SubmitButton size="sm" variant="outline">{a.status === "ACTIVE" ? "Disable" : "Enable"}</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer font-semibold text-navy-700">Add an administrator</summary>
          <ActionForm action={createAdminUser} resetOnSuccess className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Name" htmlFor="a-name"><Input id="a-name" name="name" required /></Field>
            <Field label="Email" htmlFor="a-email"><Input id="a-email" name="email" type="email" required /></Field>
            <Field label="Temporary password" htmlFor="a-pass" hint="12+ characters"><Input id="a-pass" name="password" type="password" minLength={12} required autoComplete="new-password" /></Field>
            <div className="sm:col-span-3"><SubmitButton>Create Administrator</SubmitButton></div>
          </ActionForm>
        </details>
      </Section>

      <Section title="Change my password">
        <ActionForm action={changeOwnPassword} resetOnSuccess className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" required autoComplete="current-password" /></Field>
          <Field label="New password" htmlFor="password"><Input id="password" name="password" type="password" minLength={12} required autoComplete="new-password" /></Field>
          <Field label="Confirm new password" htmlFor="confirm"><Input id="confirm" name="confirm" type="password" required autoComplete="new-password" /></Field>
          <div className="sm:col-span-3"><SubmitButton>Change Password</SubmitButton></div>
        </ActionForm>
      </Section>

      <Section title="System status">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="font-semibold text-slate-500">Database</dt><dd>Connected</dd></div>
          <div><dt className="font-semibold text-slate-500">File storage</dt><dd>{storage === "ok" ? "S3 storage connected" : storage === "local-dev" ? "Local disk (development only)" : storage}</dd></div>
        </dl>
      </Section>
    </div>
  );
}
