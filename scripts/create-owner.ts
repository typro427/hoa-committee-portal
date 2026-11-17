/**
 * Create (or reset the password of) a platform owner — the account for the owner console
 * at https://<ROOT_DOMAIN>/platform, which manages every HOA.
 *
 *   npm run owner:create -- --email you@example.com --name "Your Name"
 *   (prompts for the password; or set OWNER_PASSWORD)
 */
import { createInterface } from "node:readline/promises";
import { arg, argon, prisma } from "./_shared";

async function main() {
  const email = (arg("email") ?? process.env.OWNER_EMAIL ?? "").trim().toLowerCase();
  const name = arg("name") ?? process.env.OWNER_NAME ?? "Owner";
  if (!email.includes("@")) throw new Error("Provide --email you@example.com");
  let password = process.env.OWNER_PASSWORD;
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question("Password (14+ characters): ");
    rl.close();
  }
  if (!password || password.length < 14) throw new Error("Owner passwords must be at least 14 characters.");
  const db = prisma();
  const passwordHash = await argon(password);
  const existing = await db.platformUser.findUnique({ where: { email } });
  if (existing) {
    await db.platformUser.update({ where: { email }, data: { passwordHash, status: "ACTIVE" } });
    await db.session.deleteMany({ where: { platformUserId: existing.id } });
    console.log(`Password reset for owner ${email}.`);
  } else {
    await db.platformUser.create({ data: { email, name, passwordHash } });
    console.log(`Owner account ${email} created.`);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
