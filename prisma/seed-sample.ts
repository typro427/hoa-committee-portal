/**
 * DEVELOPMENT / DEMO ONLY. Adds realistic sample members, meetings, minutes and tasks
 * and prints each sample member's PIN. Remove before going live:
 *   npm run db:clear-sample -- --confirm
 */
import { argon, pinLookup, prisma, randomPin } from "../scripts/_shared";

const PEOPLE: Record<string, { first: string; last: string; role: "CHAIR" | "SECRETARY" | "MEMBER"; position?: string }[]> = {
  "Safety and Security Committee": [
    { first: "Marcus", last: "Bennett", role: "CHAIR" },
    { first: "Linda", last: "Ortiz", role: "SECRETARY" },
    { first: "Greg", last: "Haley", role: "MEMBER", position: "Neighborhood Watch Liaison" },
    { first: "Priya", last: "Nair", role: "MEMBER" },
  ],
  "Special Events Committee": [
    { first: "Dana", last: "Whitfield", role: "CHAIR" },
    { first: "Tom", last: "Reyes", role: "SECRETARY" },
    { first: "Kelly", last: "Park", role: "MEMBER", position: "Volunteer Coordinator" },
    { first: "Sam", last: "Donovan", role: "MEMBER" },
  ],
  "Architectural Review Board": [
    { first: "Robert", last: "Chen", role: "CHAIR" },
    { first: "Angela", last: "Moss", role: "SECRETARY" },
    { first: "Victor", last: "Alvarez", role: "MEMBER" },
    { first: "Jessica", last: "Lane", role: "MEMBER" },
  ],
};

const day = (offset: number) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset));
};

async function main() {
  const db = prisma();
  const org = await db.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) throw new Error("Run `npm run db:seed` first.");
  const committees = await db.committee.findMany({ where: { organizationId: org.id } });
  const pins: string[] = [];
  const used = new Set<string>();

  for (const c of committees) {
    const people = PEOPLE[c.name];
    if (!people) continue;
    if (await db.committeeMembership.count({ where: { committeeId: c.id } })) {
      console.log(`${c.name}: already has members, skipping.`);
      continue;
    }
    const members = [];
    for (const p of people) {
      let pin = randomPin();
      while (used.has(pin)) pin = randomPin();
      used.add(pin);
      const m = await db.member.create({
        data: {
          organizationId: org.id, firstName: p.first, lastName: p.last,
          email: `${p.first.toLowerCase()}.${p.last.toLowerCase()}@example.com`,
          pinHash: await argon(pin), pinLookup: pinLookup(pin), pinGeneratedAt: new Date(),
        },
      });
      await db.committeeMembership.create({ data: { committeeId: c.id, memberId: m.id, role: p.role, position: p.position ?? null } });
      members.push({ ...m, role: p.role });
      pins.push(`${pin}  ${p.first} ${p.last} — ${p.role} — ${c.name}`);
    }
    const chair = members.find((m) => m.role === "CHAIR")!;
    const sec = members.find((m) => m.role === "SECRETARY")!;

    // Past meeting with published minutes.
    const past = await db.meeting.create({
      data: {
        committeeId: c.id, title: "Monthly Committee Meeting", meetingType: "REGULAR", meetingDate: day(-28),
        startTime: "18:30", endTime: "19:45", location: "Clubhouse Meeting Room", status: "COMPLETED", createdByMemberId: chair.id,
      },
    });
    await db.agendaItem.createMany({
      data: [
        { meetingId: past.id, section: "CALL_TO_ORDER", title: "Call to Order", displayOrder: 10 },
        { meetingId: past.id, section: "OLD_BUSINESS", title: "Review open action items", displayOrder: 20 },
        { meetingId: past.id, section: "NEW_BUSINESS", title: "Plans for next quarter", displayOrder: 30 },
        { meetingId: past.id, section: "ADJOURNMENT", title: "Adjournment", displayOrder: 40 },
      ],
    });
    await db.meetingAttendance.createMany({
      data: members.map((m, i) => ({ meetingId: past.id, memberId: m.id, attendeeName: `${m.firstName} ${m.lastName}`, attendanceStatus: i === 3 ? "ABSENT" : "PRESENT" })),
    });
    const minutes = await db.meetingMinutes.create({
      data: {
        meetingId: past.id, status: "PUBLISHED",
        chairpersonName: `${chair.firstName} ${chair.lastName}`, secretaryName: `${sec.firstName} ${sec.lastName}`,
        callToOrder: "The meeting was called to order at 6:32 PM by the chair.",
        previousMinutes: "Minutes of the previous meeting were approved as presented.",
        oldBusiness: "Reviewed status of open items from the prior meeting. Two items were completed.",
        newBusiness: "Discussed priorities and budget needs for the coming quarter.",
        committeeReports: "The chair reported on communication with the Board of Directors.",
        projectUpdates: "Vendor quotes are being collected for the next project.",
        recommendations: "Recommend the Board approve the proposed quarterly plan.",
        adjournmentTime: "19:41",
        preparedById: sec.id, submittedAt: day(-25), approvedById: chair.id,
        approvedByName: `${chair.firstName} ${chair.lastName}`, approvedAt: day(-24), publishedAt: day(-24),
      },
    });
    await db.motion.create({
      data: {
        minutesId: minutes.id, description: "Motion to recommend the quarterly plan to the Board of Directors.",
        movedById: chair.id, movedByName: `${chair.firstName} ${chair.lastName}`, secondedById: sec.id, secondedByName: `${sec.firstName} ${sec.lastName}`,
        votesFor: 3, votesAgainst: 0, abstentions: 0, outcome: "PASSED", displayOrder: 1,
      },
    });
    await db.task.createMany({
      data: [
        { committeeId: c.id, meetingId: past.id, title: "Collect three vendor quotes", assignedMemberId: members[2].id, createdByMemberId: chair.id, priority: "HIGH", status: "IN_PROGRESS", dueDate: day(10) },
        { committeeId: c.id, meetingId: past.id, title: "Draft resident communication", assignedMemberId: sec.id, createdByMemberId: chair.id, priority: "NORMAL", status: "NOT_STARTED", dueDate: day(-3) },
        { committeeId: c.id, title: "Update committee contact list", assignedMemberId: members[3].id, createdByMemberId: chair.id, priority: "LOW", status: "COMPLETED", completedAt: day(-5), completedByMemberId: members[3].id, completedByName: `${members[3].firstName} ${members[3].lastName}`, completionNotes: "Shared with the chair." },
      ],
    });

    // Upcoming meeting with standard agenda.
    const next = await db.meeting.create({
      data: {
        committeeId: c.id, title: "Monthly Committee Meeting", meetingType: "REGULAR", meetingDate: day(9),
        startTime: "18:30", endTime: "19:30", location: "Clubhouse Meeting Room", status: "SCHEDULED", createdByMemberId: chair.id,
        description: "Regular monthly meeting. Residents are welcome to attend the first 15 minutes.",
      },
    });
    const sections = ["CALL_TO_ORDER", "ROLL_CALL", "APPROVAL_OF_PREVIOUS_MINUTES", "OLD_BUSINESS", "NEW_BUSINESS", "ADJOURNMENT"] as const;
    const labels: Record<string, string> = { CALL_TO_ORDER: "Call to Order", ROLL_CALL: "Roll Call", APPROVAL_OF_PREVIOUS_MINUTES: "Approval of Previous Minutes", OLD_BUSINESS: "Vendor quote review", NEW_BUSINESS: "Annual planning kickoff", ADJOURNMENT: "Adjournment" };
    await db.agendaItem.createMany({ data: sections.map((s, i) => ({ meetingId: next.id, section: s, title: labels[s], displayOrder: (i + 1) * 10 })) });
    console.log(`${c.name}: sample data added.`);
  }

  if (pins.length) {
    console.log("\nSample member PINs (development only):");
    for (const p of pins) console.log("  " + p);
  }
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
