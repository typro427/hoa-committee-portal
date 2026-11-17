/**
 * Create (or reset the password of) an administrator.
 *
 *   npm run admin:create -- --email you@example.com --name "Jane Smith" [--org deerfield]
 *   (prompts for the password; or set ADMIN_PASSWORD in the environment)
 */
import { createInterface } from "node:readline/promises";
import { arg, argon, prisma, resolveOrg } from "./_shared";

async function main() {
  const email = (arg("email") ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = arg("name") ?? process.env.ADMIN_NAME ?? "Administrator";
  if (!email.includes("@")) throw new Error("Provide --email you@example.com");
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (12+ characters): ");
    rl.close();
  }
  if (!password || password.length < 12) throw new Error("Password must be at least 12 characters.");
  const db = prisma();
  const org = await resolveOrg(db);
  const passwordHash = await argon(password);
  const key = { organizationId_email: { organizationId: org.id, email } };
  const existing = await db.adminUser.findUnique({ where: key });
  if (existing) {
    await db.adminUser.update({ where: key, data: { passwordHash, status: "ACTIVE" } });
    await db.session.deleteMany({ where: { adminUserId: existing.id } });
    console.log(`Password reset for administrator ${email}.`);
  } else {
    await db.adminUser.create({ data: { organizationId: org.id, email, name, passwordHash } });
    console.log(`Administrator ${email} created for ${org.name}.`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
