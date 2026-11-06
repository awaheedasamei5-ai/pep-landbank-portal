export type DigestKind = "morning" | "evening";
export type DigestItem = Record<string, string | number | null>;

export interface DigestStaff {
  key: string;
  name: string;
  tasks: DigestItem[];
  followUps: DigestItem[];
  leadNextActions: DigestItem[];
  visitsScheduled: DigestItem[];
  newLeads: DigestItem[];
  calls: DigestItem[];
  otherActivity: DigestItem[];
  visitRequests: DigestItem[];
  approvedReceipts: DigestItem[];
  tasksCompletedToday: DigestItem[];
  tasksMissed: DigestItem[];
}

export interface DigestSnapshot {
  date: string;
  kind: DigestKind;
  timezone: string;
  generatedAt: string;
  staff: DigestStaff[];
}

export interface DigestRun {
  id: string;
  local_date: string;
  kind: DigestKind;
  generated_at: string;
  snapshot: DigestSnapshot;
}

export interface DigestDelivery {
  id: string;
  run_id: string;
  status: "queued" | "sending" | "accepted" | "failed" | "needs_review" | "blocked";
  attempt_count: number;
  provider_accepted_at: string | null;
  last_error: string | null;
}

export function digestTotals(snapshot: DigestSnapshot) {
  return snapshot.staff.reduce(
    (total, staff) => ({
      tasks: total.tasks + staff.tasks.length,
      tasksOpenToday: total.tasksOpenToday + staff.tasks.filter((task) => task.status === "open").length,
      followUps: total.followUps + staff.followUps.length + staff.leadNextActions.length,
      visitsScheduled: total.visitsScheduled + staff.visitsScheduled.length,
      calls: total.calls + staff.calls.length,
      newLeads: total.newLeads + staff.newLeads.length,
      visitRequests: total.visitRequests + staff.visitRequests.length,
      tasksCompleted: total.tasksCompleted + staff.tasksCompletedToday.length,
      tasksMissed: total.tasksMissed + staff.tasksMissed.length,
      approvedReceipts: total.approvedReceipts + staff.approvedReceipts.length,
      approvedCash:
        total.approvedCash + staff.approvedReceipts.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
    }),
    {
      tasks: 0,
      followUps: 0,
      visitsScheduled: 0,
      calls: 0,
      newLeads: 0,
      visitRequests: 0,
      tasksCompleted: 0,
      tasksMissed: 0,
      approvedReceipts: 0,
      approvedCash: 0,
      tasksOpenToday: 0,
    },
  );
}
