import "server-only";
import type { Actor } from "./session";

/**
 * Central authorization rules. Every server action and data loader calls these;
 * hiding buttons in the UI is never relied upon for security.
 */

export class ForbiddenError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isAdmin(a: Actor) {
  return a.kind === "admin";
}

/** Member actors may only touch records in their active committee. */
export function inCommittee(a: Actor, committeeId: string) {
  return a.kind === "admin" || a.committeeId === committeeId;
}

export function isChair(a: Actor, committeeId: string) {
  return a.kind === "member" && a.committeeId === committeeId && a.role === "CHAIR";
}

export function isLeadership(a: Actor, committeeId: string) {
  return a.kind === "admin" || (a.kind === "member" && a.committeeId === committeeId && (a.role === "CHAIR" || a.role === "SECRETARY"));
}

export const can = {
  viewCommittee: (a: Actor, c: string) => inCommittee(a, c),
  manageMeetings: (a: Actor, c: string) => isAdmin(a) || isChair(a, c),
  manageAgenda: (a: Actor, c: string) => isLeadership(a, c),
  recordAttendance: (a: Actor, c: string) => isLeadership(a, c),
  viewDraftMinutes: (a: Actor, c: string) => isLeadership(a, c),
  createMinutes: (a: Actor, c: string) => isLeadership(a, c),
  editDraftMinutes: (a: Actor, c: string) => isLeadership(a, c),
  reviewMinutes: (a: Actor, c: string) => isAdmin(a) || isChair(a, c),
  publishMinutes: (a: Actor, c: string) =>
    isAdmin(a) ||
    isChair(a, c) ||
    (a.kind === "member" && a.committeeId === c && a.role === "SECRETARY" && a.canPublishMinutes),
  amendPublishedMinutes: (a: Actor, c: string) => isAdmin(a) || isChair(a, c),
  viewRevisions: (a: Actor) => isAdmin(a),
  manageDocuments: (a: Actor, c: string) => isLeadership(a, c),
  manageFolders: (a: Actor, c: string) => isAdmin(a) || isChair(a, c),
  manageTasks: (a: Actor, c: string) => isLeadership(a, c),
  viewAllCommitteeTasks: (a: Actor, c: string) => isLeadership(a, c),
};

export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) throw new ForbiddenError(message);
}
