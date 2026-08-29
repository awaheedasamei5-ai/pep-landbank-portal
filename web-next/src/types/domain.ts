// App-level domain types -- deliberately only the fields Phase 1's Home/
// StreakCard slice actually touches. Widened as later phases port more of
// index.html's DB shape (leads/payments/schedule_items/etc.).

export type Role = 'agent' | 'manager';

export interface Profile {
  key: string;
  name: string;
  role: Role;
  email?: string;
}

export interface Lead {
  id: string;
  agent: string;
  name: string;
  date: string;
  amtPaid: number;
  grandTotal: number;
  stage: string;
}

export interface Payment {
  id: string;
  leadId: string;
  agentKey: string;
  amount: number;
  date: string;
}

export type ScheduleItemStatus = 'open' | 'closed' | 'cancelled' | 'rescheduled';

export interface ScheduleItem {
  id: string;
  kind: 'todo' | 'task';
  ownerKey: string;
  assignedTo: string;
  date: string;
  status: ScheduleItemStatus;
  title: string;
}

export interface StreakRow {
  staffKey: string;
  date: string;
  dayMet: boolean;
}

export interface Config {
  workEndTime: string;
  targetPlotsPerMonth: number;
  targets: Record<string, number>;
}
