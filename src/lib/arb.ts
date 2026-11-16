// Architectural Review Board (ARB) request labels and stage rules. Safe for client and server.

export const ARB_STATUS_LABELS = {
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under Review",
  MORE_INFO_NEEDED: "More Info Needed",
  APPROVED: "Approved",
  APPROVED_WITH_CONDITIONS: "Approved with Conditions",
  DENIED: "Denied",
  CONSTRUCTION_IN_PROGRESS: "Construction In Progress",
  AWAITING_BUILDING_PERMIT: "Awaiting Building Permit",
  COMPLETED: "Completed",
} as const;
export type ArbStatusKey = keyof typeof ARB_STATUS_LABELS;

/** What each stage means, in plain words for the resident. */
export const ARB_STATUS_HELP: Record<ArbStatusKey, string> = {
  SUBMITTED: "Your request was received. The Architectural Review Board will begin reviewing it soon.",
  UNDER_REVIEW: "The board is reviewing your plans.",
  MORE_INFO_NEEDED: "The board needs more information or documents from you. See the messages below.",
  APPROVED: "Your project is approved. You may begin construction.",
  APPROVED_WITH_CONDITIONS: "Your project is approved with conditions. Please read them below before you begin.",
  DENIED: "Your request was not approved. See the board's explanation below.",
  CONSTRUCTION_IN_PROGRESS: "Construction is underway.",
  AWAITING_BUILDING_PERMIT: "Construction is finished. Please upload the finalized building permit so the board can close your request.",
  COMPLETED: "Your project is complete and the request is closed. Thank you!",
};

/** The main path shown as a progress bar. Denied ends the path early. */
export const ARB_PROGRESS_STEPS: { key: string; label: string; statuses: ArbStatusKey[] }[] = [
  { key: "submitted", label: "Submitted", statuses: ["SUBMITTED"] },
  { key: "review", label: "Review", statuses: ["UNDER_REVIEW", "MORE_INFO_NEEDED"] },
  { key: "decision", label: "Decision", statuses: ["APPROVED", "APPROVED_WITH_CONDITIONS", "DENIED"] },
  { key: "construction", label: "Construction", statuses: ["CONSTRUCTION_IN_PROGRESS"] },
  { key: "permit", label: "Building Permit", statuses: ["AWAITING_BUILDING_PERMIT"] },
  { key: "done", label: "Completed", statuses: ["COMPLETED"] },
];
export function progressIndex(status: ArbStatusKey) {
  return ARB_PROGRESS_STEPS.findIndex((s) => s.statuses.includes(status));
}

export const ARB_DECISION_STATUSES: ArbStatusKey[] = ["APPROVED", "APPROVED_WITH_CONDITIONS", "DENIED"];
export const ARB_CLOSED_STATUSES: ArbStatusKey[] = ["DENIED", "COMPLETED"];

/** Groups for the committee's list tabs. */
export const ARB_LIST_GROUPS: { key: string; label: string; statuses: ArbStatusKey[] }[] = [
  { key: "review", label: "Needs Review", statuses: ["SUBMITTED", "UNDER_REVIEW", "MORE_INFO_NEEDED"] },
  { key: "approved", label: "Approved / Building", statuses: ["APPROVED", "APPROVED_WITH_CONDITIONS", "CONSTRUCTION_IN_PROGRESS"] },
  { key: "permit", label: "Awaiting Permit", statuses: ["AWAITING_BUILDING_PERMIT"] },
  { key: "closed", label: "Closed", statuses: ["COMPLETED", "DENIED"] },
];

export const ARB_PROJECT_LABELS = {
  NEW_CONSTRUCTION: "New home construction",
  ADDITION: "Addition / room expansion",
  DECK_OR_PATIO: "Deck, porch or patio",
  FENCE: "Fence or wall",
  POOL_OR_SPA: "Pool or spa",
  SHED_OR_ACCESSORY: "Shed, garage or accessory building",
  DRIVEWAY: "Driveway or walkway",
  ROOF: "Roof replacement or change",
  EXTERIOR_PAINT: "Exterior paint / color change",
  LANDSCAPING: "Landscaping or tree removal",
  SOLAR: "Solar panels",
  OTHER: "Other",
} as const;

export const ARB_DOC_TYPES = {
  PLAT_PLAN: { label: "Plat plan", help: "Survey or site plan showing your lot lines and where the project sits on the lot." },
  ELEVATIONS: { label: "Elevation drawings", help: "Drawings of each side of the structure showing height, materials and appearance from each angle." },
  UTILITY_LOCATIONS: { label: "Utility locations", help: "Where water, gas and electric lines run, and whether each is overhead or buried." },
  BUILDING_PERMIT: { label: "Building permit", help: "The building permit, uploaded after the project is complete." },
  OTHER: { label: "Other supporting documents", help: "Photos, product sheets, color samples, contractor quotes, or anything else that helps." },
} as const;
export type ArbDocTypeKey = keyof typeof ARB_DOC_TYPES;
/** Documents expected with the initial request (the permit comes after completion). */
export const ARB_REQUIRED_AT_SUBMISSION: ArbDocTypeKey[] = ["PLAT_PLAN", "ELEVATIONS", "UTILITY_LOCATIONS"];

export const UTILITY_LABELS = {
  OVERHEAD: "Overhead",
  BURIED: "Buried",
  NOT_APPLICABLE: "Not applicable",
  UNKNOWN: "Not sure",
} as const;

export const ARB_STATUS_TONE: Record<ArbStatusKey, "gray" | "navy" | "green" | "amber" | "red" | "blue"> = {
  SUBMITTED: "blue",
  UNDER_REVIEW: "navy",
  MORE_INFO_NEEDED: "amber",
  APPROVED: "green",
  APPROVED_WITH_CONDITIONS: "green",
  DENIED: "red",
  CONSTRUCTION_IN_PROGRESS: "navy",
  AWAITING_BUILDING_PERMIT: "amber",
  COMPLETED: "green",
};
