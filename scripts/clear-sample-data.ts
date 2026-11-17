/**
 * Removes ONE HOA's members, meetings, minutes, tasks, documents, ARB requests, sessions, and audit history
 * so it can go live with a clean slate. Keeps the HOA, its committees/folders, and its administrators.
 * Other HOAs are never touched. Uploaded files are not deleted from storage.
 *
 *   npm run db:clear-sample -- --confirm [--org deerfield]   (--org is required when there's more than one HOA)
 */
import { prisma, resolveOrg } from "./_shared";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.log("This permanently deletes all members, meetings, minutes, tasks, documents and audit history.");
    console.log("Re-run with --confirm to proceed:  npm run db:clear-sample -- --confirm");
    process.exit(1);
  }
  const db = prisma();
  const org = await resolveOrg(db);
  const inOrg = { committee: { organizationId: org.id } };
  const meeting = { meeting: inOrg };
  await db.$transaction([
    db.session.deleteMany({ where: { member: { organizationId: org.id } } }),
    db.auditLog.deleteMany({ where: { organizationId: org.id } }),
    db.motion.deleteMany({ where: { minutes: meeting } }),
    db.meetingMinuteRevision.deleteMany({ where: { minutes: meeting } }),
    db.arbRequestEvent.deleteMany({ where: { request: inOrg } }),
    db.document.deleteMany({ where: inOrg }),
    db.arbRequest.deleteMany({ where: inOrg }),
    db.task.deleteMany({ where: inOrg }),
    db.meetingMinutes.deleteMany({ where: meeting }),
    db.meetingAttendance.deleteMany({ where: meeting }),
    db.agendaItem.deleteMany({ where: meeting }),
    db.meeting.deleteMany({ where: inOrg }),
    db.committeeMembership.deleteMany({ where: inOrg }),
    db.member.deleteMany({ where: { organizationId: org.id } }),
  ]);
  console.log(`Sample data removed from ${org.name}. Its committees and administrators were kept.`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
