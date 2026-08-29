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

export type PlotType = 'Full Plot' | 'Half Plot';
export type PaymentPlan = 'Full Payment' | '3 Months' | '6 Months' | '9 Months' | '12 Months';
// Internal stage codes -- displayed to staff via the flipped
// DISPLAY_STAGE_CODE mapping (index.html:17138), never shown raw.
export type Stage = '1' | '2A' | '2B' | '3' | '4' | 'Lost';

export interface Lead {
  id: string;
  agent: string;
  name: string;
  contact: string;
  date: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  paymentPlan: PaymentPlan;
  amtPaid: number;
  grandTotal: number;
  stage: Stage;
  notes?: string;
}

export interface NewLead {
  name: string;
  contact: string;
  plotType: PlotType;
  noPlots: number;
  unitPrice: number;
  paymentPlan: PaymentPlan;
  amtPaid: number;
  notes?: string;
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
