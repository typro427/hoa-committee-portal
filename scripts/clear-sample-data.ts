/**
 * Removes ALL members, meetings, minutes, tasks, documents, ARB requests, sessions, and audit history so the
 * portal can go live with a clean slate. Keeps the organization, committees, and administrators.
 * Uploaded files in object storage are NOT deleted (remove them from your bucket if desired).
 *
 *   npm run db:clear-sample -- --confirm
 */
import { prisma } from "./_shared";

async function main() {
  if (!process.argv.includes("--confirm")) {
    console.log("This permanently deletes all members, meetings, minutes, tasks, documents and audit history.");
    console.log("Re-run with --confirm to proceed:  npm run db:clear-sample -- --confirm");
    process.exit(1);
  }
  const db = prisma();
  await db.$transaction([
    db.session.deleteMany({ where: { memberId: { not: null } } }),
    db.loginAttempt.deleteMany({}),
    db.auditLog.deleteMany({}),
    db.motion.deleteMany({}),
    db.meetingMinuteRevision.deleteMany({}),
    db.arbRequestEvent.deleteMany({}),
    db.document.deleteMany({}),
    db.arbRequest.deleteMany({}),
    db.task.deleteMany({}),
    db.meetingMinutes.deleteMany({}),
    db.meetingAttendance.deleteMany({}),
    db.agendaItem.deleteMany({}),
    db.meeting.deleteMany({}),
    db.committeeMembership.deleteMany({}),
    db.member.deleteMany({}),
  ]);
  console.log("Sample data removed. Organization, committees, and administrators were kept.");
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
