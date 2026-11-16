/**
 * Production-safe initial setup. Idempotent: creates the organization and the starting
 * committees only if they don't exist yet. Committee names are ordinary data — rename,
 * archive, or add committees any time from Admin → Committees.
 *
 *   ORG_NAME="Willow Creek HOA" npm run db:seed
 */
import { prisma } from "../scripts/_shared";
import { DEFAULT_FOLDERS } from "../src/lib/format";

const STARTING_COMMITTEES = [
  { name: "Safety and Security Committee", description: "Community safety, security patrols, gate access, lighting, and emergency preparedness." },
  { name: "Special Events Committee", description: "Plans and runs community events, socials, and seasonal celebrations." },
  { name: "Architectural Review Board", description: "Reviews homeowner architectural modification requests for compliance with community guidelines." },
];

async function main() {
  const db = prisma();
  let org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    org = await db.organization.create({
      data: {
        name: process.env.ORG_NAME || "Our HOA",
        slug: (process.env.ORG_NAME || "our-hoa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        timezone: process.env.ORG_TIMEZONE || "America/New_York",
      },
    });
    console.log(`Created organization: ${org.name}`);
  } else {
    console.log(`Organization exists: ${org.name}`);
  }
  if ((await db.committee.count({ where: { organizationId: org.id } })) === 0) {
    for (const c of STARTING_COMMITTEES) {
      const created = await db.committee.create({ data: { ...c, organizationId: org.id } });
      await db.documentFolder.createMany({ data: DEFAULT_FOLDERS.map((name, i) => ({ committeeId: created.id, name, displayOrder: (i + 1) * 10 })) });
      console.log(`Created committee: ${c.name}`);
    }
  } else {
    console.log("Committees already exist; leaving them unchanged.");
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
