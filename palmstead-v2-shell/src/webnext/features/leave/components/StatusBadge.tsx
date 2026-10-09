import { Badge } from "@/components/ui/badge";
import type { LeaveRequest } from "../../../types/domain";

// Adapted from Shreyasmark1/leave-management-system's status-badge.tsx,
// mapped to Palmstead's real statuses (planned/pending/approved/declined/
// rescheduled) instead of the reference's (pending/approved/rejected/
// cancelled).
const STATUS_VARIANT: Record<LeaveRequest["status"], "default" | "secondary" | "destructive" | "outline"> = {
  planned: "secondary",
  pending: "outline",
  approved: "default",
  declined: "destructive",
  rescheduled: "outline",
};

const STATUS_LABEL: Record<LeaveRequest["status"], string> = {
  planned: "Planned",
  pending: "Pending",
  approved: "Approved",
  declined: "Declined",
  rescheduled: "Reschedule requested",
};

export function StatusBadge({ status }: { status: LeaveRequest["status"] }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
