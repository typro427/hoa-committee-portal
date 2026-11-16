import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_FOLDERS } from "@/lib/format";

export async function committeeFolders(committeeId: string) {
  return db.documentFolder.findMany({ where: { committeeId }, orderBy: [{ displayOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

/** Creates the standard folders for a new committee. */
export async function createDefaultFolders(committeeId: string) {
  await db.documentFolder.createMany({
    data: DEFAULT_FOLDERS.map((name, i) => ({ committeeId, name, displayOrder: (i + 1) * 10 })),
    skipDuplicates: true,
  });
}

/**
 * Where automatically-filed uploads go (meeting attachments, agenda files, Zoom notes, task files):
 * a folder whose name mentions "meeting" for meeting files, otherwise one mentioning "general".
 * Falls back to Unfiled if the chair has renamed or removed those folders.
 */
export async function autoFolderId(committeeId: string, forMeeting: boolean) {
  const folders = await committeeFolders(committeeId);
  const pick = (re: RegExp) => folders.find((f) => re.test(f.name))?.id;
  return (forMeeting ? pick(/meeting/i) : undefined) ?? pick(/general/i) ?? null;
}

/** Throws unless the folder exists in this committee. */
export async function assertFolderInCommittee(folderId: string, committeeId: string) {
  const f = await db.documentFolder.findUnique({ where: { id: folderId }, select: { committeeId: true } });
  if (!f || f.committeeId !== committeeId) throw new Error("FOLDER_MISMATCH");
}
