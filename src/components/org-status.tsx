import { Badge, type Tone } from "@/components/ui/badge";

export const ORG_STATUS_LABELS = { TRIAL: "Trial", ACTIVE: "Active", PAST_DUE: "Past due", SUSPENDED: "Suspended", CANCELLED: "Cancelled" } as const;
const tone: Record<keyof typeof ORG_STATUS_LABELS, Tone> = { TRIAL: "blue", ACTIVE: "green", PAST_DUE: "amber", SUSPENDED: "red", CANCELLED: "gray" };

export function OrgStatusBadge({ status, trialEndsAt }: { status: keyof typeof ORG_STATUS_LABELS; trialEndsAt?: Date | null }) {
  const expired = status === "TRIAL" && trialEndsAt && trialEndsAt.getTime() < Date.now();
  return <Badge tone={expired ? "red" : tone[status]}>{expired ? "Trial ended" : ORG_STATUS_LABELS[status]}</Badge>;
}
