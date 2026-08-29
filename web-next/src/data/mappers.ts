import type { Lead, Payment, ScheduleItem, ScheduleItemStatus, StreakRow, Config } from '../types/domain';

// snake_case (real Postgres columns, confirmed live against the schema)
// <-> camelCase (this app's domain types) mapping, one function per
// resource -- mirrors index.html's mapLead()/mapTodo()/mapStreak() pattern
// exactly, including the one real vocabulary translation: the DB's
// schedule_items.status uses 'done' for a completed item; every screen in
// this app (and the old index.html) works in terms of 'closed' instead.
// Getting this translation wrong is exactly the kind of silent bug that
// only shows up once real data is involved -- so it lives in one place,
// tested once, instead of being repeated at every call site.

export function mapLeadRow(r: Record<string, unknown>): Lead {
  return {
    id: r.id as string,
    agent: r.agent_key as string,
    name: r.name as string,
    contact: (r.contact as string) ?? '',
    date: r.date_added as string,
    plotType: (r.plot_type as Lead['plotType']) ?? 'Full Plot',
    noPlots: Number(r.no_plots ?? 1),
    unitPrice: Number(r.unit_price ?? 0),
    paymentPlan: (r.payment_plan as Lead['paymentPlan']) ?? 'Full Payment',
    amtPaid: Number(r.amt_paid ?? 0),
    grandTotal: Number(r.grand_total ?? 0),
    stage: (r.stage as Lead['stage']) ?? '1',
    notes: (r.notes as string) ?? undefined,
  };
}

export function mapPaymentRow(r: Record<string, unknown>): Payment {
  return {
    id: r.id as string,
    leadId: r.lead_id as string,
    agentKey: r.agent_key as string,
    amount: Number(r.amount ?? 0),
    date: r.payment_date as string,
  };
}

const DB_TO_DOMAIN_STATUS: Record<string, ScheduleItemStatus> = { open: 'open', done: 'closed', cancelled: 'cancelled', rescheduled: 'rescheduled' };
const DOMAIN_TO_DB_STATUS: Record<ScheduleItemStatus, string> = { open: 'open', closed: 'done', cancelled: 'cancelled', rescheduled: 'rescheduled' };

export function mapScheduleItemRow(r: Record<string, unknown>): ScheduleItem {
  return {
    id: r.id as string,
    kind: r.kind as ScheduleItem['kind'],
    ownerKey: r.owner_key as string,
    assignedTo: (r.assigned_to as string) ?? (r.owner_key as string),
    date: (r.item_date as string) ?? (r.due_date as string),
    status: DB_TO_DOMAIN_STATUS[r.status as string] ?? 'open',
    title: r.title as string,
  };
}

export function domainStatusToDb(status: ScheduleItemStatus): string {
  return DOMAIN_TO_DB_STATUS[status];
}

export function mapStreakRow(r: Record<string, unknown>): StreakRow {
  return {
    staffKey: r.staff_key as string,
    date: r.streak_date as string,
    dayMet: !!r.streak_day_met,
  };
}

export function mapConfigRow(r: Record<string, unknown>): Config {
  return {
    workEndTime: (r.work_end_time as string) ?? '17:00',
    targetPlotsPerMonth: Number(r.target_plots_per_month ?? 2),
    targets: (r.targets as Record<string, number>) ?? {},
  };
}
